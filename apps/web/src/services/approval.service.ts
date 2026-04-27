import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED';

export interface Approval {
  id: string;
  eventId: string;
  reviewerId?: string;
  status: ApprovalStatus;
  originalContent?: string;
  editedContent?: string;
  comment?: string;
  createdAt: string;
  reviewedAt?: string;
  event?: {
    id: string;
    type: string;
    title: string;
    repository: {
      name: string;
    };
  };
}

interface ApprovalsResponse {
  approvals: Approval[];
  total: number;
}

export const approvalService = {
  /**
   * 获取审批列表
   */
  async getApprovals(options?: {
    status?: ApprovalStatus;
    limit?: number;
    offset?: number;
  }): Promise<ApprovalsResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    const { data } = await apiClient.get<ApiResponse<ApprovalsResponse>>(`/approvals?${params}`);
    return data.data;
  },

  /**
   * 获取待审批数量
   */
  async getPendingCount(): Promise<{ count: number }> {
    const { data } = await apiClient.get<ApiResponse<{ count: number }>>('/approvals/pending-count');
    return data.data;
  },

  /**
   * 获取审批详情
   */
  async getById(approvalId: string): Promise<Approval> {
    const { data } = await apiClient.get<ApiResponse<Approval>>(`/approvals/${approvalId}`);
    return data.data;
  },

  /**
   * 审批通过
   */
  async approve(approvalId: string, comment?: string): Promise<Approval> {
    const { data } = await apiClient.post<ApiResponse<Approval>>(`/approvals/${approvalId}/approve`, { comment });
    return data.data;
  },

  /**
   * 审批拒绝
   */
  async reject(approvalId: string, comment?: string): Promise<Approval> {
    const { data } = await apiClient.post<ApiResponse<Approval>>(`/approvals/${approvalId}/reject`, { comment });
    return data.data;
  },

  /**
   * 编辑后审批
   */
  async editAndApprove(approvalId: string, editedContent: string, comment?: string): Promise<Approval> {
    const { data } = await apiClient.post<ApiResponse<Approval>>(`/approvals/${approvalId}/edit`, {
      editedContent,
      comment,
    });
    return data.data;
  },
};
