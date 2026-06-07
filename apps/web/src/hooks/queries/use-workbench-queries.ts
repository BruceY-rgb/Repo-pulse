import { useApiQuery } from '@/lib/query-hooks';
import {
  workbenchService,
  type ConversationMessagesParams,
  type WatchFeedParams,
} from '@/services/workbench.service';

export const workbenchQueryKeys = {
  all: ['workbench'] as const,
  chatRepositories: () => [...workbenchQueryKeys.all, 'chat-repositories'] as const,
  watchRepositories: () => [...workbenchQueryKeys.all, 'watch-repositories'] as const,
  watchFeedRoot: () => [...workbenchQueryKeys.all, 'watch-feed'] as const,
  conversationMessagesRoot: () => [...workbenchQueryKeys.all, 'conversation-messages'] as const,
  conversationMessages: (repositoryId: string, params?: ConversationMessagesParams) =>
    [
      ...workbenchQueryKeys.conversationMessagesRoot(),
      repositoryId,
      params?.cursor ?? null,
      params?.skip ?? null,
      params?.take ?? null,
      JSON.stringify(params?.repositoryBranchScopes ?? {}),
    ] as const,
  watchFeed: (type: string, params?: Omit<WatchFeedParams, 'type'>) =>
    [
      ...workbenchQueryKeys.watchFeedRoot(),
      type || 'all',
      params?.cursor ?? null,
      params?.limit ?? null,
    ] as const,
};

export function useChatRepositoriesQuery() {
  return useApiQuery({
    queryKey: workbenchQueryKeys.chatRepositories(),
    queryFn: () => workbenchService.getChatRepositories(),
    staleTime: 30 * 1000,
  });
}

export function useConversationMessagesQuery(
  repositoryId?: string,
  params?: ConversationMessagesParams,
) {
  return useApiQuery({
    queryKey: workbenchQueryKeys.conversationMessages(repositoryId ?? '', params),
    queryFn: () => workbenchService.getConversationMessages(repositoryId!, params),
    enabled: Boolean(repositoryId),
    staleTime: 15 * 1000,
  });
}

export function useWatchFeedQuery(type: string, params?: Omit<WatchFeedParams, 'type'>) {
  return useApiQuery({
    queryKey: workbenchQueryKeys.watchFeed(type, params),
    queryFn: () => workbenchService.getWatchFeed({ ...params, type: type || undefined }),
    staleTime: 30 * 1000,
  });
}
