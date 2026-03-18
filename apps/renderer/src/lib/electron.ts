import type { AgentSpec, MemoryFact, UserMapNode, WorkItem } from '@supreme/shared';

export interface LocalProfile {
  name: string;
  email: string;
}

export interface ProviderModel {
  id: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'google';
  label: string;
  installed: boolean;
  recommended?: boolean;
}

export interface WorkspaceSnapshot {
  profile: LocalProfile | null;
  agents: AgentSpec[];
  groups: Array<{ id: string; name: string; description?: string; memberAgentIds: string[] }>;
  workItems: WorkItem[];
  userMap: UserMapNode;
  memoryFacts: MemoryFact[];
  models: ProviderModel[];
  runtime: {
    available: boolean;
    ollamaReady: boolean;
    openClawReady: boolean;
    message?: string;
  };
}

export interface PrismReply {
  id: string;
  text: string;
  createdAgent?: AgentSpec;
}

export interface SupremeDesktopApi {
  profile: {
    get: () => Promise<LocalProfile | null>;
    save: (profile: LocalProfile) => Promise<LocalProfile>;
  };
  workspace: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
  };
  userMap: {
    save: (tree: UserMapNode) => Promise<UserMapNode>;
    syncMemories: () => Promise<{ tree: UserMapNode; facts: MemoryFact[] }>;
  };
  prism: {
    sendMessage: (input: { message: string }) => Promise<PrismReply>;
  };
}

declare global {
  interface Window {
    supreme?: SupremeDesktopApi;
  }
}

export function getDesktopApi(): SupremeDesktopApi {
  if (!window.supreme) {
    throw new Error('Supreme Raman AI desktop bridge is unavailable.');
  }

  return window.supreme;
}
