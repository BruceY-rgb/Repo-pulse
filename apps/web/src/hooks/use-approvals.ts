import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalService, type Approval, type ApprovalStatus } from '@/services/approval.service';

// Query Keys
export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...approvalKeys.lists(), filters] as const,
  pendingCount: () => [...approvalKeys.all, 'pending-count'] as const,
  details: () => [...approvalKeys.all, 'detail'] as const,
  detail: (id: string) => [...approvalKeys.details(), id] as const,
};

// Queries
export function useApprovals(options?: {
  status?: ApprovalStatus;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: approvalKeys.list(options || {}),
    queryFn: () => approvalService.getApprovals(options),
  });
}

export function useApprovalPendingCount() {
  return useQuery({
    queryKey: approvalKeys.pendingCount(),
    queryFn: () => approvalService.getPendingCount(),
    refetchInterval: 30000, // 每 30 秒轮询
  });
}

export function useApproval(id: string) {
  return useQuery({
    queryKey: approvalKeys.detail(id),
    queryFn: () => approvalService.getById(id),
    enabled: !!id,
  });
}

// Mutations
export function useApproveApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalService.approve(approvalId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}

export function useRejectApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ approvalId, comment }: { approvalId: string; comment?: string }) =>
      approvalService.reject(approvalId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}

export function useEditAndApproveApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      approvalId,
      editedContent,
      comment,
    }: {
      approvalId: string;
      editedContent: string;
      comment?: string;
    }) => approvalService.editAndApprove(approvalId, editedContent, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}