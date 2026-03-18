import type {
  AgentSpec,
  ArtifactRecord,
  ChatMessage,
  ChatThread,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  OllamaRuntimeStatus,
  PrismReply,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderAuthSelection,
  ProviderId,
  ProviderModelPreset,
  TaskSpec,
  UserMapState,
  WorkItem
} from '@supreme/shared';

export type { LocalProfile };

export interface WorkspaceSnapshot {
  profile: LocalProfile | null;
  agents: AgentSpec[];
  groups: GroupSpec[];
  chatThreads: ChatThread[];
  tasks: TaskSpec[];
  workItems: WorkItem[];
  artifacts: ArtifactRecord[];
  userMap: UserMapState;
  memoryFacts: MemoryFact[];
  models: ProviderModelPreset[];
  runtime: {
    available: boolean;
    ollamaReady: boolean;
    runtimeBridgeReady: boolean;
    message?: string;
  };
}

export interface TaskCreateInput {
  title: string;
  objective: string;
  mode: TaskSpec['mode'];
  target: TaskSpec['target'];
  schedule: {
    kind: TaskSpec['schedule']['kind'];
    runAtLocal?: string;
    preset?: 'daily' | 'weekly' | 'monthly';
    time?: string;
    expression?: string;
  };
  output?: {
    artifactMode?: TaskSpec['outputPolicy']['artifactMode'];
    notificationMode?: TaskSpec['outputPolicy']['notificationMode'];
    defaultSendToChat?: boolean;
  };
  modelOverrideId?: string;
  council?: {
    workerModelIds?: string[];
    judgeModelId?: string;
  };
}

export interface AgentChatInput {
  agentId: string;
  message: string;
}

export interface GroupChatInput {
  groupId: string;
  message: string;
}

export interface ChatSendResult {
  thread: ChatThread;
  newMessages: ChatMessage[];
}

export interface LocalBundleMetadata {
  outputPath: string;
  createdAt: string;
  includedItems: string[];
}

export interface SupremeDesktopApi {
  profile: {
    get: () => Promise<LocalProfile | null>;
    save: (profile: LocalProfile) => Promise<LocalProfile>;
  };
  workspace: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
    createBackupExport: () => Promise<LocalBundleMetadata>;
  };
  userMap: {
    save: (tree: UserMapState) => Promise<UserMapState>;
    syncMemories: () => Promise<{ tree: UserMapState; facts: MemoryFact[] }>;
  };
  groups: {
    upsert: (group: GroupSpec) => Promise<GroupSpec>;
    delete: (groupId: string) => Promise<{ ok: true }>;
  };
  prism: {
    sendMessage: (input: { mode: 'ask' | 'create'; message: string; userMap: UserMapState; existingAgents: AgentSpec[]; existingGroups: GroupSpec[] }) => Promise<PrismReply>;
  };
  chat: {
    sendAgentMessage: (input: AgentChatInput) => Promise<ChatSendResult>;
    sendGroupMessage: (input: GroupChatInput) => Promise<ChatSendResult>;
    deleteThread: (threadId: string) => Promise<{ ok: true }>;
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
  settings: {
    listProviderProfiles: () => Promise<ProviderAuthProfile[]>;
    saveProviderProfile: (input: {
      id: string;
      provider: Exclude<ProviderId, 'ollama'>;
      label: string;
      description?: string;
      apiKey?: string;
      token?: string;
      isDefault?: boolean;
    }) => Promise<ProviderAuthProfile>;
    deleteProviderProfile: (input: {
      provider: Exclude<ProviderId, 'ollama'>;
      profileId: string;
    }) => Promise<{ ok: true }>;
    testProviderProfile: (input: {
      provider: Exclude<ProviderId, 'ollama'>;
      profileId: string;
      probeWithRuntime?: boolean;
    }) => Promise<{ ok: boolean; message: string }>;
    getProviderSelection: (provider: ProviderId) => Promise<ProviderAuthSelection | null>;
    setProviderSelection: (selection: ProviderAuthSelection) => Promise<ProviderAuthSelection>;
    getPrismOverride: () => Promise<PrismProviderOverrideSettings | null>;
    savePrismOverride: (override: PrismProviderOverrideSettings | null) => Promise<PrismProviderOverrideSettings | null>;
    getOllamaStatus: () => Promise<OllamaRuntimeStatus>;
    installDefaultModels: () => Promise<OllamaRuntimeStatus>;
  };
  support: {
    createBundle: () => Promise<LocalBundleMetadata>;
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
