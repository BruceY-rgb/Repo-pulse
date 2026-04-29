import { Injectable, Logger } from '@nestjs/common';
import { prisma, Approval, ApprovalStatus, RiskLevel } from '@repo-pulse/database';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';

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

  private async resolveRepositoryIds(
    userId: string,
    repositoryIdsParam?: string,
  ): Promise<string[]> {
    const userRepos = await prisma.userRepository.findMany({
      where: { userId },
      select: { repositoryId: true },
    });

    const accessibleRepositoryIds = userRepos.map(
      (repository: { repositoryId: string }) => repository.repositoryId,
    );

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

  /**
   * 获取用户的审批列表
   */
  async getApprovals(
    userId: string,
    options?: {
      status?: ApprovalStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ approvals: Approval[]; total: number }> {
    const where: Record<string, unknown> = {};

    // 查找用户有权限审批的事件
    const userRepos = await prisma.userRepository.findMany({
      where: { userId },
      select: { repositoryId: true },
    });

    const repoIds = userRepos.map((r: { repositoryId: string }) => r.repositoryId);

    // 如果用户没有任何仓库，返回空结果
    if (repoIds.length === 0) {
      return { approvals: [], total: 0 };
    }

    // 获取用户仓库对应的事件
    const events = await prisma.event.findMany({
      where: { repositoryId: { in: repoIds } },
      select: { id: true },
    });
    const eventIds = events.map((e: { id: string }) => e.id);

    // 如果没有事件，返回空结果
    if (eventIds.length === 0) {
      return { approvals: [], total: 0 };
    }

    where.eventId = { in: eventIds };

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

  /**
   * 获取待审批数量
   */
  async getPendingCount(
    userId: string,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ): Promise<number> {
    const repoIds = await this.resolveRepositoryIds(userId, repositoryIdsParam);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repoIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );

    // 如果用户没有任何仓库，返回 0
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

  /**
   * 根据事件创建审批记录（由 AI 分析触发）
   */
  async createFromAIAnalysis(eventId: string): Promise<Approval> {
    // 获取事件及其 AI 分析结果
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        analyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const latestAnalysis = event.analyses[0];

    // 只有 HIGH 或 CRITICAL 风险等级才需要审批
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

  /**
   * 审批通过
   */
  async approve(
    approvalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval is not pending: ${approvalId}`);
    }

    return prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewerId,
        comment,
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * 审批拒绝
   */
  async reject(
    approvalId: string,
    reviewerId: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval is not pending: ${approvalId}`);
    }

    return prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewerId,
        comment,
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * 编辑后审批
   */
  async editAndApprove(
    approvalId: string,
    reviewerId: string,
    editedContent: string,
    comment?: string,
  ): Promise<Approval> {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    if (approval.status !== ApprovalStatus.PENDING) {
      throw new Error(`Approval is not pending: ${approvalId}`);
    }

    return prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: ApprovalStatus.EDITED,
        reviewerId,
        editedContent,
        comment,
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * 获取审批详情
   */
  async getById(approvalId: string): Promise<Approval | null> {
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
