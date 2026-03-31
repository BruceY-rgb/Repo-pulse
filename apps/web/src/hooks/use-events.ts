import { useQuery } from '@tanstack/react-query';
import { eventService, type EventStats } from '@/services/event.service';

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
  repositoryId: string,
  options?: {
    page?: number;
    pageSize?: number;
    type?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
) {
  return useQuery({
    queryKey: eventKeys.list({ repositoryId, ...options }),
    queryFn: () => eventService.getAll(repositoryId, options),
    enabled: !!repositoryId,
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
  repositoryId: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
  },
) {
  return useQuery({
    queryKey: eventKeys.stats(repositoryId),
    queryFn: () => eventService.getStats(repositoryId, options?.dateFrom, options?.dateTo),
    enabled: !!repositoryId,
  });
}