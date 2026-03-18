import type {
  AgentSpec,
  ArtifactRecord,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  PrismReply,
  ProviderId,
  ProviderModelPreset,
  TaskSpec,
  UserMapNode,
  WorkItem
} from '@supreme/shared';

export type { LocalProfile };

export interface WorkspaceSnapshot {
  profile: LocalProfile | null;
  agents: AgentSpec[];
  groups: GroupSpec[];
  tasks: TaskSpec[];
  workItems: WorkItem[];
  artifacts: ArtifactRecord[];
  userMap: UserMapNode;
  memoryFacts: MemoryFact[];
  models: ProviderModelPreset[];
  runtime: {
    available: boolean;
    ollamaReady: boolean;
    openClawReady: boolean;
    message?: string;
  };
}

export interface TaskCreateInput {
  title: string;
  objective: string;
  mode: TaskSpec['mode'];
  target: TaskSpec['target'];
  providerOverride?: {
    provider: ProviderId;
    modelId: string;
  };
  schedule: TaskSpec['schedule'];
  outputPolicy: {
    saveResult: true;
    artifactMode: TaskSpec['outputPolicy']['artifactMode'];
    notificationMode: TaskSpec['outputPolicy']['notificationMode'];
    defaultSendToChat: boolean;
  };
  council?: TaskSpec['council'];
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
    sendMessage: (input: { mode: 'ask' | 'create'; message: string; userMap: UserMapNode; existingAgents: AgentSpec[]; existingGroups: GroupSpec[] }) => Promise<PrismReply>;
  };
  tasks: {
    create: (task: TaskCreateInput) => Promise<TaskSpec>;
    delete: (taskId: string) => Promise<{ ok: true }>;
    duplicate: (taskId: string) => Promise<TaskSpec>;
    rerun: (taskId: string) => Promise<TaskSpec>;
  };
  work: {
    delete: (workItemId: string) => Promise<{ ok: true }>;
    openArtifact: (artifactId: string) => Promise<{ ok: true }>;
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
