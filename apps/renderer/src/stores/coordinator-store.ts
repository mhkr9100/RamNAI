// Workspace — Zustand Store
import { create } from 'zustand';
import { getDesktopApi } from '@/lib/electron';
import type { WorkspaceSnapshot } from '@/lib/electron';
import type { CoordinatorMode, WorkItem } from '@workspace/shared';
import { useWorkspaceStore } from './workspace-store';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatWorkMessage(item: WorkItem): string {
  return `Injected from Work — ${item.title}\n\n${item.summary ?? item.lastError ?? 'No saved body.'}`;
}

export interface CoordinatorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  mode?: CoordinatorMode | 'work';
}

export interface CoordinatorStoreState {
  messages: CoordinatorMessage[];
  busy: boolean;
  activeMode: CoordinatorMode | 'task' | 'council';
  sendMessage: (mode: CoordinatorMode, message: string, snapshot: WorkspaceSnapshot) => Promise<void>;
  clearTranscript: () => void;
  setActiveMode: (mode: CoordinatorMode | 'task' | 'council') => void;
  injectWorkMessage: (item: WorkItem) => void;
}

export const useCoordinatorStore = create<CoordinatorStoreState>((set, get) => ({
  messages: [],
  busy: false,
  activeMode: 'ask',
  async sendMessage(mode, message, snapshot) {
    if (get().busy) {
      return;
    }

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      return;
    }

    const workspaceStore = useWorkspaceStore.getState();
    const userMessage: CoordinatorMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmedMessage,
      mode
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      busy: true,
      activeMode: mode
    }));

    workspaceStore.clearError();

    try {
      const reply = await getDesktopApi().coordinator.sendMessage({
        mode,
        message: trimmedMessage,
        userMap: snapshot.userMap,
        existingAgents: snapshot.agents,
        existingGroups: snapshot.groups
      });

      set((state) => ({
        messages: [...state.messages, { id: reply.id, role: 'assistant', text: reply.text, mode }],
        busy: false
      }));

      await workspaceStore.refreshSnapshot();

      if (reply.createdAgent && useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(`Created ${reply.createdAgent.name}.`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      set((state) => ({
        messages: [...state.messages, { id: crypto.randomUUID(), role: 'system', text: errorMessage, mode }],
        busy: false
      }));

      workspaceStore.setError(errorMessage);
    }
  },
  clearTranscript() {
    if (get().messages.length === 0) {
      return;
    }

    set({ messages: [] });
  },
  setActiveMode(activeMode) {
    if (get().activeMode === activeMode) {
      return;
    }

    set({ activeMode });
  },
  injectWorkMessage(item) {
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: formatWorkMessage(item),
          mode: 'work'
        }
      ]
    }));
  }
}));
