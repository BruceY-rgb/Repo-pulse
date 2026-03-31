import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { repositoryService } from '@/services/repository.service';
import type { CreateRepositoryDto } from '@/types/api';

// Query Keys
export const repositoryKeys = {
  all: ['repositories'] as const,
  lists: () => [...repositoryKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...repositoryKeys.lists(), filters] as const,
  details: () => [...repositoryKeys.all, 'detail'] as const,
  detail: (id: string) => [...repositoryKeys.details(), id] as const,
};

// Queries
export function useRepositories(isActive?: boolean) {
  return useQuery({
    queryKey: repositoryKeys.list({ isActive }),
    queryFn: () => repositoryService.getAll(isActive),
  });
}

export function useRepository(id: string) {
  return useQuery({
    queryKey: repositoryKeys.detail(id),
    queryFn: () => repositoryService.getById(id),
    enabled: !!id,
  });
}

export function useRepositoryEvents(
  repositoryId: string,
  options?: {
    page?: number;
    pageSize?: number;
    type?: string;
  },
) {
  return useQuery({
    queryKey: [...repositoryKeys.detail(repositoryId), 'events', options] as const,
    queryFn: () => repositoryService.getEvents(repositoryId, options),
    enabled: !!repositoryId,
  });
}

export function useSearchRepositories(query: string) {
  return useQuery({
    queryKey: ['search', 'repositories', query] as const,
    queryFn: () => repositoryService.search(query),
    enabled: query.length > 0,
  });
}

export function useMyRepositories() {
  return useQuery({
    queryKey: ['my-repos'] as const,
    queryFn: () => repositoryService.getMyRepos(),
  });
}

export function useStarredRepositories() {
  return useQuery({
    queryKey: ['starred'] as const,
    queryFn: () => repositoryService.getStarred(),
  });
}

// Mutations
export function useCreateRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateRepositoryDto) => repositoryService.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

export function useUpdateRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateRepositoryDto> }) =>
      repositoryService.update(id, dto),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: repositoryKeys.lists() });
    },
  });
}

export function useDeleteRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repositoryService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}

export function useSyncRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repositoryService.sync(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    },
  });
}