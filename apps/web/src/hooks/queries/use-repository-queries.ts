import { useApiMutation, useApiQuery } from '@/lib/query-hooks';
import { repositoryService } from '@/services/repository.service';
import type { CreateRepositoryDto } from '@/types/api';

export const repositoryQueryKeys = {
  all: ['repositories'] as const,
  list: () => [...repositoryQueryKeys.all, 'list'] as const,
  branches: (id: string) => [...repositoryQueryKeys.all, 'branches', id] as const,
  myRepos: () => [...repositoryQueryKeys.all, 'my-repos'] as const,
  starred: () => [...repositoryQueryKeys.all, 'starred'] as const,
  search: (keyword: string) => [...repositoryQueryKeys.all, 'search', keyword] as const,
};

export function useRepositoryListQuery() {
  return useApiQuery({
    queryKey: repositoryQueryKeys.list(),
    queryFn: () => repositoryService.getAll(),
    staleTime: 30 * 1000,
  });
}

export function useMyRepositoryCandidatesQuery(enabled: boolean) {
  return useApiQuery({
    queryKey: repositoryQueryKeys.myRepos(),
    queryFn: repositoryService.getMyRepos,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useRepositoryBranchesQuery(repositoryId: string, enabled: boolean) {
  return useApiQuery({
    queryKey: repositoryQueryKeys.branches(repositoryId),
    queryFn: () => repositoryService.getBranches(repositoryId),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useStarredRepositoryCandidatesQuery(enabled: boolean) {
  return useApiQuery({
    queryKey: repositoryQueryKeys.starred(),
    queryFn: repositoryService.getStarred,
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useSearchRepositoryCandidatesQuery(keyword: string, enabled: boolean) {
  return useApiQuery({
    queryKey: repositoryQueryKeys.search(keyword),
    queryFn: () => repositoryService.search(keyword),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useCreateRepositoryMutation() {
  return useApiMutation({
    mutationKey: [...repositoryQueryKeys.all, 'create'],
    mutationFn: (payload: CreateRepositoryDto) => repositoryService.create(payload),
  });
}

export function useSyncRepositoryMutation() {
  return useApiMutation({
    mutationKey: [...repositoryQueryKeys.all, 'sync'],
    mutationFn: (id: string) => repositoryService.sync(id),
  });
}

export function useDeleteRepositoryMutation() {
  return useApiMutation({
    mutationKey: [...repositoryQueryKeys.all, 'delete'],
    mutationFn: (id: string) => repositoryService.delete(id),
  });
}

export function useUpdateRepositoryMutation() {
  return useApiMutation({
    mutationKey: [...repositoryQueryKeys.all, 'update'],
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      repositoryService.update(id, { isActive }),
  });
}
