// Supreme Raman AI — Zustand Store
import { create } from 'zustand';
import { getDesktopApi } from '@/lib/electron';
import type { WorkspaceSnapshot } from '@/lib/electron';

const POLLING_INTERVAL_MS = 3000;
const LOAD_MORE_PAGE_SIZE = 100;

let pollingIntervalId: number | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface WorkspaceStoreState {
  snapshot: WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  refreshSnapshot: () => Promise<void>;
  loadMoreTasks: () => Promise<void>;
  loadMoreWorkItems: () => Promise<void>;
  loadMoreChatThreads: () => Promise<void>;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  clearNotice: () => void;
  clearError: () => void;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  snapshot: null,
  loading: false,
  error: null,
  notice: null,
  async refreshSnapshot() {
    const shouldShowLoading = get().snapshot === null;

    if (shouldShowLoading) {
      set({ loading: true, error: null });
    } else {
      set({ error: null });
    }

    try {
      const snapshot = await getDesktopApi().workspace.getSnapshot();
      set({ snapshot, loading: false });
    } catch (error) {
      set({
        error: getErrorMessage(error),
        loading: false
      });
    }
  },
  async loadMoreTasks() {
    const { snapshot } = get();
    if (!snapshot?.counts || snapshot.tasks.length >= snapshot.counts.tasks) return;
    const next = await getDesktopApi().workspace.listTasksPaginated(LOAD_MORE_PAGE_SIZE, snapshot.tasks.length);
    const seen = new Set(snapshot.tasks.map((t) => t.id));
    const merged = [...snapshot.tasks, ...next.filter((t) => !seen.has(t.id))];
    set({ snapshot: { ...snapshot, tasks: merged } });
  },
  async loadMoreWorkItems() {
    const { snapshot } = get();
    if (!snapshot?.counts || snapshot.workItems.length >= snapshot.counts.workItems) return;
    const next = await getDesktopApi().workspace.listWorkItemsPaginated(LOAD_MORE_PAGE_SIZE, snapshot.workItems.length);
    const seen = new Set(snapshot.workItems.map((w) => w.id));
    const merged = [...snapshot.workItems, ...next.filter((w) => !seen.has(w.id))];
    set({ snapshot: { ...snapshot, workItems: merged } });
  },
  async loadMoreChatThreads() {
    const { snapshot } = get();
    if (!snapshot?.counts || snapshot.chatThreads.length >= snapshot.counts.chatThreads) return;
    const next = await getDesktopApi().workspace.listChatThreadsPaginated(LOAD_MORE_PAGE_SIZE, snapshot.chatThreads.length);
    const seen = new Set(snapshot.chatThreads.map((t) => t.id));
    const merged = [...snapshot.chatThreads, ...next.filter((t) => !seen.has(t.id))];
    set({ snapshot: { ...snapshot, chatThreads: merged } });
  },
  setError(error) {
    set({ error });
  },
  setNotice(notice) {
    set({ notice });
  },
  clearNotice() {
    set({ notice: null });
  },
  clearError() {
    set({ error: null });
  },
  startPolling() {
    if (typeof window === 'undefined' || pollingIntervalId !== null) {
      return;
    }

    pollingIntervalId = window.setInterval(() => {
      void get().refreshSnapshot();
    }, POLLING_INTERVAL_MS);
  },
  stopPolling() {
    if (typeof window === 'undefined' || pollingIntervalId === null) {
      return;
    }

    window.clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}));
