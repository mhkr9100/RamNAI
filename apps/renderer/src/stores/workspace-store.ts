// Supreme Raman AI — Zustand Store
import { create } from 'zustand';
import { getDesktopApi } from '@/lib/electron';
import type { WorkspaceSnapshot } from '@/lib/electron';

const POLLING_INTERVAL_MS = 3000;

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
