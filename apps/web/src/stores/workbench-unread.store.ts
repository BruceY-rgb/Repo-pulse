import { create } from 'zustand';

export interface WorkbenchUnreadBoundary {
  repositoryId: string;
  messageId: string;
  readUpToMessageAt: string;
  unreadCount: number;
  capturedAt: string;
}

interface WorkbenchUnreadState {
  optimisticReadAtByRepository: Record<string, string>;
  boundaries: Record<string, WorkbenchUnreadBoundary>;
  setOptimisticRead: (repositoryId: string, readAt: string) => void;
  clearOptimisticRead: (repositoryId: string) => void;
  clearOptimisticReadIfMessageAfterRead: (repositoryId: string, messageAt?: string | null) => void;
  setBoundary: (boundary: WorkbenchUnreadBoundary) => void;
  clearBoundary: (repositoryId: string) => void;
}

function toTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export const useWorkbenchUnreadStore = create<WorkbenchUnreadState>((set) => ({
  optimisticReadAtByRepository: {},
  boundaries: {},

  setOptimisticRead: (repositoryId, readAt) =>
    set((state) => ({
      optimisticReadAtByRepository: {
        ...state.optimisticReadAtByRepository,
        [repositoryId]: readAt,
      },
    })),

  clearOptimisticRead: (repositoryId) =>
    set((state) => {
      if (!state.optimisticReadAtByRepository[repositoryId]) {
        return state;
      }

      const next = { ...state.optimisticReadAtByRepository };
      delete next[repositoryId];
      return { optimisticReadAtByRepository: next };
    }),

  clearOptimisticReadIfMessageAfterRead: (repositoryId, messageAt) =>
    set((state) => {
      const readAt = state.optimisticReadAtByRepository[repositoryId];
      if (!readAt) {
        return state;
      }

      const readAtMs = toTime(readAt);
      const messageAtMs = toTime(messageAt);
      if (readAtMs !== null && messageAtMs !== null && messageAtMs <= readAtMs) {
        return state;
      }

      const next = { ...state.optimisticReadAtByRepository };
      delete next[repositoryId];
      return { optimisticReadAtByRepository: next };
    }),

  setBoundary: (boundary) =>
    set((state) => ({
      boundaries: {
        ...state.boundaries,
        [boundary.repositoryId]: boundary,
      },
    })),

  clearBoundary: (repositoryId) =>
    set((state) => {
      if (!state.boundaries[repositoryId]) {
        return state;
      }

      const next = { ...state.boundaries };
      delete next[repositoryId];
      return { boundaries: next };
    }),
}));
