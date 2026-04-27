import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApprovalService, UpdateApprovalDto } from './approval.service';
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
    @CurrentUser() user: { userId: string },
    @Query('status') status?: ApprovalStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ approvals: Approval[]; total: number }> {
    return this.approvalService.getApprovals(user.userId, {
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
    @CurrentUser() user: { userId: string },
    @Query('repositoryIds') repositoryIds?: string,
  ): Promise<{ count: number }> {
    const count = await this.approvalService.getPendingCount(user.userId, repositoryIds);
    return { count };
  }

  /**
   * 获取审批详情
   */
  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) approvalId: string,
  ): Promise<Approval | null> {
    return this.approvalService.getById(approvalId);
  }

  /**
   * 审批通过
   */
  @Post(':id/approve')
  async approve(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) approvalId: string,
    @Body() body: { comment?: string },
  ): Promise<Approval> {
    return this.approvalService.approve(approvalId, user.userId, body.comment);
  }

  /**
   * 审批拒绝
   */
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) approvalId: string,
    @Body() body: { comment?: string },
  ): Promise<Approval> {
    return this.approvalService.reject(approvalId, user.userId, body.comment);
  }

  /**
   * 编辑后审批
   */
  @Post(':id/edit')
  async editAndApprove(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) approvalId: string,
    @Body() body: { editedContent: string; comment?: string },
  ): Promise<Approval> {
    return this.approvalService.editAndApprove(
      approvalId,
      user.userId,
      body.editedContent,
      body.comment,
    );
  }
}
