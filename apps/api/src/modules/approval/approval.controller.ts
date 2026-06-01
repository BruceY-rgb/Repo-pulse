import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApprovalService } from './approval.service';
import type { Approval, ApprovalStatus } from '@repo-pulse/database';

@Controller('approvals')
@UseGuards(AuthGuard('jwt'))
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  /**
   * 获取审批列表
   */
  @Get()
  async getApprovals(
    @CurrentUser() user: { sub: string },
    @Query('status') status?: ApprovalStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ approvals: Approval[]; total: number }> {
    return this.approvalService.getApprovals(user.sub, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * 获取待审批数量
   */
  @Get('pending-count')
  async getPendingCount(
    @CurrentUser() user: { sub: string },
    @Query('repositoryIds') repositoryIds?: string,
    @Query('branchScopes') branchScopes?: string,
  ): Promise<{ count: number }> {
    const count = await this.approvalService.getPendingCount(user.sub, repositoryIds, branchScopes);
    return { count };
  }

  /**
   * 获取审批详情
   */
  @Get(':id')
  async getById(
    @CurrentUser() user: { sub: string },
    @Param('id') approvalId: string,
  ): Promise<Approval | null> {
    return this.approvalService.getById(user.sub, approvalId);
  }

  /**
   * 审批通过
   */
  @Post(':id/approve')
  async approve(
    @CurrentUser() user: { sub: string },
    @Param('id') approvalId: string,
    @Body() body: { comment?: string },
  ): Promise<Approval> {
    return this.approvalService.approve(approvalId, user.sub, body.comment);
  }

  /**
   * 审批拒绝
   */
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: { sub: string },
    @Param('id') approvalId: string,
    @Body() body: { comment?: string },
  ): Promise<Approval> {
    return this.approvalService.reject(approvalId, user.sub, body.comment);
  }

  /**
   * 删除审批记录
   */
  @Delete(':id')
  async delete(@CurrentUser() user: { sub: string }, @Param('id') approvalId: string) {
    const approval = await this.approvalService.getById(user.sub, approvalId);
    if (!approval) throw new NotFoundException('Approval not found');
    await this.approvalService.delete(user.sub, approvalId);
    return { success: true };
  }

  /**
   * 编辑后审批
   */
  @Post(':id/edit')
  async editAndApprove(
    @CurrentUser() user: { sub: string },
    @Param('id') approvalId: string,
    @Body() body: { editedContent: string; comment?: string },
  ): Promise<Approval> {
    return this.approvalService.editAndApprove(
      approvalId,
      user.sub,
      body.editedContent,
      body.comment,
    );
  }
}
