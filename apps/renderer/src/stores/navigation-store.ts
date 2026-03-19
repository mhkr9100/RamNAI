// Supreme Raman AI — Zustand Store
import { create } from 'zustand';

export type ViewId = 'home' | 'prism' | 'chats' | 'spectrum' | 'work' | 'usermap' | 'settings';

export interface NavigationStoreState {
  activeView: ViewId;
  navigate: (view: ViewId) => void;
}

export const useNavigationStore = create<NavigationStoreState>((set, get) => ({
  activeView: 'home',
  navigate(activeView) {
    if (get().activeView === activeView) {
      return;
    }

    set({ activeView });
  }
}));
