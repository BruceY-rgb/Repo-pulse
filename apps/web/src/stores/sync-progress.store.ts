import { create } from 'zustand';
import type { RepositorySyncStage } from '@repo-pulse/shared';

export interface RepositorySyncState {
  jobId: string;
  progress: number;
  stage: RepositorySyncStage;
}

interface SyncProgressStore {
  byRepoId: Record<string, RepositorySyncState>;
  start: (repoId: string, jobId: string) => void;
  update: (repoId: string, state: RepositorySyncState) => void;
  clear: (repoId: string) => void;
}

export const useSyncProgressStore = create<SyncProgressStore>((set) => ({
  byRepoId: {},
  start: (repoId, jobId) =>
    set((s) => ({
      byRepoId: {
        ...s.byRepoId,
        [repoId]: { jobId, progress: 0, stage: 'commits' },
      },
    })),
  update: (repoId, state) =>
    set((s) => ({
      byRepoId: { ...s.byRepoId, [repoId]: state },
    })),
  clear: (repoId) =>
    set((s) => {
      if (!(repoId in s.byRepoId)) return s;
      const next = { ...s.byRepoId };
      delete next[repoId];
      return { byRepoId: next };
    }),
}));

export function useRepositorySyncState(
  repoId: string,
): RepositorySyncState | undefined {
  return useSyncProgressStore((s) => s.byRepoId[repoId]);
}
