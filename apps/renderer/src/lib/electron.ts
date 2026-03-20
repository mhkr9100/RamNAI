import type {
  AgentMode,
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
  VoiceConfig,
  VoiceEvent,
  WorkItem
} from '@supreme/shared';

export type { LocalProfile };

export interface WorkspaceSnapshotCounts {
  tasks: number;
  workItems: number;
  chatThreads: number;
}

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
  /** Present when snapshot used lazy load (lite mode); use loadMore to fetch additional items */
  counts?: WorkspaceSnapshotCounts;
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
  /** Client-generated id so stream tokens can be correlated before `invoke` resolves */
  streamId?: string;
}

export interface GroupChatInput {
  groupId: string;
  message: string;
  streamId?: string;
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

export interface StreamTokenEvent {
  streamId: string;
  token: string;
  done: boolean;
  error?: string;
  assistantLabel?: string;
  routeMode?: string;
}

export interface WorkspaceSecurityState {
  enabled: boolean;
  locked: boolean;
  ready: boolean;
}

export interface SupremeDesktopApi {
  profile: {
    get: () => Promise<LocalProfile | null>;
    save: (profile: LocalProfile) => Promise<LocalProfile>;
  };
  workspace: {
    getSnapshot: () => Promise<WorkspaceSnapshot>;
    createBackupExport: () => Promise<LocalBundleMetadata>;
    listTasksPaginated: (limit: number, offset: number) => Promise<TaskSpec[]>;
    listWorkItemsPaginated: (limit: number, offset: number) => Promise<WorkItem[]>;
    listChatThreadsPaginated: (limit: number, offset: number) => Promise<ChatThread[]>;
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
    sendAgentMessageStream: (input: AgentChatInput) => Promise<ChatSendResult & { streamId: string }>;
    sendGroupMessageStream: (input: GroupChatInput) => Promise<ChatSendResult & { streamId: string }>;
    onStreamToken: (callback: (event: unknown, data: StreamTokenEvent) => void) => void;
    offStreamToken: () => void;
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
      id?: string;
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
    getAgentMode: () => Promise<AgentMode>;
    saveAgentMode: (mode: AgentMode) => Promise<AgentMode>;
    getOllamaStatus: () => Promise<OllamaRuntimeStatus>;
    installDefaultModels: () => Promise<OllamaRuntimeStatus>;
    getHealth: () => Promise<{
      ollama: { ready: boolean; available: boolean };
      runtimeBridge: { ready: boolean; version: string | null };
      storage: { ok: boolean };
      scheduler: { ok: boolean };
    }>;
  };
  security: {
    getState: () => Promise<WorkspaceSecurityState>;
    unlock: (password: string) => Promise<WorkspaceSecurityState>;
    enable: (password: string) => Promise<WorkspaceSecurityState>;
    disable: (password: string) => Promise<WorkspaceSecurityState>;
  };
  support: {
    createBundle: () => Promise<LocalBundleMetadata>;
    exportAuditLog: (format: 'json' | 'csv') => Promise<string>;
  };
  bridge: {
    listAgents: () => Promise<Array<{ id: string; model: string; workspace: string; routingRules: number }>>;
    sendMessage: (agentId: string, message: string) => Promise<{ text: string; agentId: string; success: boolean; durationMs: number }>;
    getSessions: (agentId?: string) => Promise<Array<{ key: string; kind: string; model: string; age: string; tokens: string }>>;
    getStatus: () => Promise<{ running: boolean; port: number; agents: number; channels: string[]; version: string } | null>;
    restartGateway: () => Promise<boolean>;
    listChannels: () => Promise<Array<{ id: string; provider: string; enabled: boolean; accountName: string }>>;
    addChannel: (channel: string, token: string) => Promise<boolean>;
    removeChannel: (channel: string) => Promise<boolean>;
    getChannelStatus: () => Promise<Array<{ channel: string; connected: boolean; lastActivity: string; messageCount: number }>>;
  };
  voice: {
    getConfig: () => Promise<VoiceConfig>;
    setConfig: (config: VoiceConfig) => Promise<VoiceConfig>;
    sendTranscript: (text: string, agentId?: string) => Promise<VoiceEvent>;
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
