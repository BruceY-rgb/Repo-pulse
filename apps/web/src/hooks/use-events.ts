import { useQuery } from '@tanstack/react-query';
import { eventService } from '@/services/event.service';

// Query Keys
export const eventKeys = {
  all: ['events'] as const,
  lists: () => [...eventKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...eventKeys.lists(), filters] as const,
  details: () => [...eventKeys.all, 'detail'] as const,
  detail: (id: string) => [...eventKeys.details(), id] as const,
  stats: (repositoryId: string) => [...eventKeys.all, 'stats', repositoryId] as const,
};

// Queries
export function useEvents(
  repositoryIds: string | string[],
  options?: {
    page?: number;
    pageSize?: number;
    type?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
) {
  const ids = Array.isArray(repositoryIds)
    ? repositoryIds.filter(Boolean)
    : repositoryIds
      ? [repositoryIds]
      : [];

  return useQuery({
    queryKey: eventKeys.list({ repositoryIds: ids, ...options }),
    queryFn: () => eventService.getAll(ids, undefined, options),
    enabled: ids.length > 0,
  });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => eventService.getById(id),
    enabled: !!id,
  });
}

export function useEventStats(
  repositoryIds: string | string[],
  options?: {
    dateFrom?: string;
    dateTo?: string;
  },
) {
  const ids = Array.isArray(repositoryIds)
    ? repositoryIds.filter(Boolean)
    : repositoryIds
      ? [repositoryIds]
      : [];

  return useQuery({
    queryKey: eventKeys.stats(ids.join(',')),
    queryFn: () => eventService.getStats(ids, undefined, options?.dateFrom, options?.dateTo),
    enabled: ids.length > 0,
  });
}
