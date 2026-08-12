export const analysisQueryKeys = {
  all: ['analyses'] as const,
  list: (params?: Record<string, unknown>) =>
    [...analysisQueryKeys.all, 'list', params ?? {}] as const,
  detail: (eventId: string) =>
    [...analysisQueryKeys.all, 'detail', eventId] as const,
};

export const approvalQueryKeys = {
  all: ['approvals'] as const,
};
