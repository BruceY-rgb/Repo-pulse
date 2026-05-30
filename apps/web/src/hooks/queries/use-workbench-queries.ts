import { useApiQuery } from '@/lib/query-hooks';
import { workbenchService, type WatchFeedParams } from '@/services/workbench.service';

export const workbenchQueryKeys = {
  all: ['workbench'] as const,
  chatRepositories: () => [...workbenchQueryKeys.all, 'chat-repositories'] as const,
  conversationMessagesRoot: () => [...workbenchQueryKeys.all, 'conversation-messages'] as const,
  conversationMessages: (repositoryId: string) =>
    [...workbenchQueryKeys.conversationMessagesRoot(), repositoryId] as const,
  watchFeed: (type: string) => [...workbenchQueryKeys.all, 'watch-feed', type || 'all'] as const,
};

export function useChatRepositoriesQuery() {
  return useApiQuery({
    queryKey: workbenchQueryKeys.chatRepositories(),
    queryFn: () => workbenchService.getChatRepositories(),
    staleTime: 30 * 1000,
  });
}

export function useConversationMessagesQuery(repositoryId?: string) {
  return useApiQuery({
    queryKey: workbenchQueryKeys.conversationMessages(repositoryId ?? ''),
    queryFn: () => workbenchService.getConversationMessages(repositoryId!),
    enabled: Boolean(repositoryId),
    staleTime: 15 * 1000,
  });
}

export function useWatchFeedQuery(type: string, params?: Omit<WatchFeedParams, 'type'>) {
  return useApiQuery({
    queryKey: workbenchQueryKeys.watchFeed(type),
    queryFn: () => workbenchService.getWatchFeed({ ...params, type: type || undefined }),
    staleTime: 30 * 1000,
  });
}
