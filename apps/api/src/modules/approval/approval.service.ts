import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  prisma,
  Approval,
  ApprovalStatus,
  RepositoryAccessLevel,
  RiskLevel,
} from '@repo-pulse/database';
import { RepositoryOperationForbiddenException } from '../../common/exceptions/repository-operation-forbidden.exception';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';
import { getAccessibleRepositoryIds } from '../../common/utils/repository-access';
import { EventGateway } from '../event/event.gateway';

export interface CreateApprovalDto {
  eventId: string;
  originalContent?: string;
}

export interface UpdateApprovalDto {
  status: ApprovalStatus;
  editedContent?: string;
  comment?: string;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(private readonly eventGateway: EventGateway) {}

  /** 审批状态变更后向对应仓库 Room 广播 approval.updated（失败不影响主流程）。 */
  private emitApprovalUpdated(
    updated: Approval,
    event: { id: string; repositoryId: string },
  ): void {
    try {
      this.eventGateway.broadcastApprovalUpdated({
        approvalId: updated.id,
        repositoryId: event.repositoryId,
        eventId: event.id,
        status: updated.status,
        updatedAt: (updated.reviewedAt ?? new Date()).toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `approval_updated_broadcast_failed id=${updated.id} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  private async resolveRepositoryIds(
    userId: string,
    repositoryIdsParam?: string,
    options?: { editableOnly?: boolean },
  ): Promise<string[]> {
    const accessibleRepositoryIds = await getAccessibleRepositoryIds(userId, {
      editableOnly: options?.editableOnly,
    });

    if (!repositoryIdsParam) {
      return accessibleRepositoryIds;
    }

    const requestedRepositoryIds = repositoryIdsParam
      .split(',')
      .map((repositoryId) => repositoryId.trim())
      .filter(Boolean);

    if (requestedRepositoryIds.length === 0) {
      return [];
    }

    const accessibleRepositoryIdSet = new Set(accessibleRepositoryIds);
    return requestedRepositoryIds.filter((repositoryId) => accessibleRepositoryIdSet.has(repositoryId));
  }

  private async getApprovalWithRepository(approvalId: string) {
    return prisma.approval.findUnique({
      where: { id: approvalId },
      include: {
        event: {
          select: {
            id: true,
            repositoryId: true,
          },
        },
      },
    });
  }

  private async assertApprovalReadable(userId: string, approvalId: string) {
    const approval = await this.getApprovalWithRepository(approvalId);
    if (!approval) {
      throw new NotFoundException(`Approval not found: ${approvalId}`);
    }

    const accessibleRepositoryIds = await getAccessibleRepositoryIds(userId);
    if (!accessibleRepositoryIds.includes(approval.event.repositoryId)) {
      throw new RepositoryOperationForbiddenException();
    }

    return approval;
  }

  private async assertApprovalEditable(userId: string, approvalId: string) {
    const approval = await this.getApprovalWithRepository(approvalId);
    if (!approval) {
      throw new NotFoundException(`Approval not found: ${approvalId}`);
    }

    const editableRepositoryIds = await getAccessibleRepositoryIds(userId, {
      editableOnly: true,
    });
    if (!editableRepositoryIds.includes(approval.event.repositoryId)) {
      throw new RepositoryOperationForbiddenException();
    }

    return approval;
  }

  async getApprovals(
    userId: string,
    options?: {
      status?: ApprovalStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ approvals: Approval[]; total: number }> {
    const repoIds = await getAccessibleRepositoryIds(userId, { editableOnly: true });
    if (repoIds.length === 0) {
      return { approvals: [], total: 0 };
    }

    const where: Record<string, unknown> = {
      event: {
        repositoryId: { in: repoIds },
      },
    };

    if (options?.status) {
      where.status = options.status;
    }

    const [approvals, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        include: {
          event: {
            include: {
              repository: true,
            },
          },
          reviewer: true,
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 20,
        skip: options?.offset ?? 0,
      }),
      prisma.approval.count({ where }),
    ]);

    return { approvals, total };
  }

  async getPendingCount(
    userId: string,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ): Promise<number> {
    const repoIds = await this.resolveRepositoryIds(userId, repositoryIdsParam, {
      editableOnly: true,
    });
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repoIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );

    if (repoIds.length === 0) {
      return 0;
    }

    return prisma.approval.count({
      where: {
        status: ApprovalStatus.PENDING,
        event: buildEventScopeWhere(repoIds, repositoryBranchScopes),
      },
    });
  }

  async createFromAIAnalysis(eventId: string): Promise<Approval> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        analyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        repository: {
          include: {
            users: {
              where: {
                accessMode: 'EDITABLE',
                accessLevel: {
                  in: [
                    RepositoryAccessLevel.OWNER,
                    RepositoryAccessLevel.ADMIN,
                    RepositoryAccessLevel.MAINTAIN,
                    RepositoryAccessLevel.WRITE,
                  ],
                },
              },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(`Event not found: ${eventId}`);
    }

    if (event.repository.users.length === 0) {
      this.logger.log(`Skipping approval for monitor-only repository event: ${eventId}`);
      return null as unknown as Approval;
    }

    const latestAnalysis = event.analyses[0];
    if (
      latestAnalysis &&
      (latestAnalysis.riskLevel === RiskLevel.HIGH ||
        latestAnalysis.riskLevel === RiskLevel.CRITICAL)
    ) {
      this.logger.log(
        `Creating approval for high-risk event: ${eventId}, risk: ${latestAnalysis.riskLevel}`,
      );

      return prisma.approval.create({
        data: {
          eventId,
          status: ApprovalStatus.PENDING,
          originalContent: latestAnalysis.summary,
        },
      });
    }

    this.logger.log(
      `No approval needed for event: ${eventId}, risk: ${latestAnalysis?.riskLevel ?? 'none'}`,
    );
    return null as unknown as Approval;
  }

  async approve(
    approvalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await this.assertApprovalEditable(reviewerId, approvalId);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ForbiddenException(`Approval is not pending: ${approvalId}`);
    }

    const updated = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewerId,
        comment,
        reviewedAt: new Date(),
      },
    });
    this.emitApprovalUpdated(updated, approval.event);
    return updated;
  }

  async reject(
    approvalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await this.assertApprovalEditable(reviewerId, approvalId);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ForbiddenException(`Approval is not pending: ${approvalId}`);
    }

    const updated = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewerId,
        comment,
        reviewedAt: new Date(),
      },
    });
    this.emitApprovalUpdated(updated, approval.event);
    return updated;
  }

  async editAndApprove(
    approvalId: string,
    reviewerId: string,
    editedContent: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await this.assertApprovalEditable(reviewerId, approvalId);
    if (approval.status !== ApprovalStatus.PENDING) {
      throw new ForbiddenException(`Approval is not pending: ${approvalId}`);
    }

    const updated = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.EDITED,
        reviewerId,
        editedContent,
        comment,
        reviewedAt: new Date(),
      },
    });
    this.emitApprovalUpdated(updated, approval.event);
    return updated;
  }

  async delete(userId: string, approvalId: string): Promise<void> {
    await this.assertApprovalEditable(userId, approvalId);
    await prisma.approval.delete({ where: { id: approvalId } });
    this.logger.log(`approval_deleted id=${approvalId}`);
  }

  async getById(userId: string, approvalId: string): Promise<Approval | null> {
    await this.assertApprovalReadable(userId, approvalId);
    return prisma.approval.findUnique({
      where: { id: approvalId },
      include: {
        event: {
          include: {
            repository: true,
            analyses: {
              where: { status: 'COMPLETED' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
        reviewer: true,
      },
    });
  }
}
