// Workspace — Zustand Store
import { create } from 'zustand';

export interface ChatTarget {
  type: 'agent' | 'group';
  id: string;
}

export interface ChatDraftSeed {
  target: ChatTarget;
  token: string;
  text: string;
}

export interface ChatStoreState {
  selectedTarget: ChatTarget | null;
  draftSeed: ChatDraftSeed | null;
  selectTarget: (target: ChatTarget) => void;
  clearTarget: () => void;
  setDraftSeed: (draftSeed: ChatDraftSeed) => void;
  clearDraftSeed: () => void;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  selectedTarget: null,
  draftSeed: null,
  selectTarget(target) {
    const currentTarget = get().selectedTarget;

    if (currentTarget?.type === target.type && currentTarget.id === target.id) {
      return;
    }

    set({ selectedTarget: target });
  },
  clearTarget() {
    if (get().selectedTarget === null) {
      return;
    }

    set({ selectedTarget: null });
  },
  setDraftSeed(draftSeed) {
    if (get().draftSeed?.token === draftSeed.token) {
      return;
    }

    set({ draftSeed });
  },
  clearDraftSeed() {
    if (get().draftSeed === null) {
      return;
    }

    set({ draftSeed: null });
  }
}));
