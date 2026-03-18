export type ProviderId = 'ollama' | 'openai' | 'anthropic' | 'google';

export type ProviderStrategy =
  | { mode: 'local_first'; preferredLocalModelIds: string[]; fallbackProviders: ProviderId[] }
  | { mode: 'fixed'; provider: ProviderId; modelId: string }
  | { mode: 'user_override'; defaultProvider: ProviderId; defaultModelId: string };

export interface AgentSpec {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdBy: 'prism';
  originObjective: string;
  persona: {
    role: string;
    mission: string;
    systemInstructions: string;
  };
  providerStrategy: ProviderStrategy;
  tools: string[];
  skills: string[];
  context: {
    userMapPaths: string[];
    workspacePaths: string[];
    memoryNamespaces: string[];
    canReadArtifacts: boolean;
    canWriteArtifacts: boolean;
  };
  runtime: {
    supportsChat: true;
    supportsTask: boolean;
    supportsRecurringTask: boolean;
    supportsMentions: boolean;
    groupEligible: boolean;
    councilEligible: boolean;
  };
  safety: {
    allowExternalNetwork: boolean;
    allowFileWrites: boolean;
    allowShell: boolean;
    approvalMode: 'never' | 'ask';
  };
  metadata: {
    createdAt: string;
    updatedAt: string;
    version: number;
    source: 'prism-create';
  };
}

export type TaskTarget =
  | { type: 'prism' }
  | { type: 'agent'; agentId: string };

export type TaskMode = 'task' | 'council';

export type ScheduleSpec =
  | { kind: 'once'; runAt: string; timezone: string }
  | { kind: 'simple'; preset: 'daily' | 'weekly' | 'monthly'; time: string; timezone: string }
  | { kind: 'cron'; expression: string; timezone: string };

export type ArtifactMode = 'none' | 'markdown' | 'json' | 'both';
export type NotificationMode = 'none' | 'in_app' | 'desktop' | 'both';

export interface TaskSpec {
  id: string;
  title: string;
  objective: string;
  mode: TaskMode;
  target: TaskTarget;
  providerOverride?: {
    provider: ProviderId;
    modelId: string;
  };
  schedule: ScheduleSpec;
  outputPolicy: {
    saveResult: true;
    artifactMode: ArtifactMode;
    notificationMode: NotificationMode;
    defaultSendToChat: boolean;
  };
  council?: {
    workerModels: Array<{ provider: ProviderId; modelId: string }>;
    judgeModel: { provider: ProviderId; modelId: string };
  };
  status: 'draft' | 'scheduled' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  lastError?: string;
  resultSummary?: string;
  artifactIds: string[];
}

export type WorkItemType = 'task' | 'council' | 'artifact';
export type WorkStatus = 'draft' | 'scheduled' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface WorkItem {
  id: string;
  type: WorkItemType;
  title: string;
  status: WorkStatus;
  sourceTaskId?: string;
  sourceAgentId?: string;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  artifactIds: string[];
  lastError?: string;
}

export interface ArtifactRecord {
  id: string;
  title: string;
  kind: 'markdown' | 'json';
  relativePath: string;
  workItemId: string;
  taskId?: string;
  createdAt: string;
}

export type MemoryCategory =
  | 'Identity'
  | 'Preferences'
  | 'Career'
  | 'Education'
  | 'Projects'
  | 'Operations'
  | 'Marketing & Communications'
  | 'Technical Stack'
  | 'Business Goals'
  | 'Instructions'
  | 'General Context';

export interface MemoryFact {
  id: string;
  category: MemoryCategory;
  label: string;
  value: string;
  confidence: number;
  source: 'chat' | 'manual' | 'task' | 'council' | 'system';
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserMapNode {
  id: string;
  label: string;
  value?: string;
  nodeType: 'root' | 'category' | 'cluster' | 'fact';
  children: UserMapNode[];
  confidence?: number;
  protected?: boolean;
  source?: 'manual' | 'memory';
}

export interface GroupSpec {
  id: string;
  name: string;
  description?: string;
  memberAgentIds: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  authorId?: string;
  authorLabel?: string;
  provider?: ProviderId;
  modelId?: string;
  mentions?: string[];
}

export interface ChatThread {
  id: string;
  targetType: 'agent' | 'group';
  targetId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface LocalProfile {
  name: string;
  email: string;
}

export interface ProviderModelPreset {
  id: string;
  provider: ProviderId;
  label: string;
  recommended: boolean;
  installed: boolean;
}

export type PrismMode = 'ask' | 'create';

export interface PrismRequest {
  mode: PrismMode;
  message: string;
  userMap: UserMapNode;
  existingAgents: AgentSpec[];
  existingGroups: GroupSpec[];
}

export interface PrismReply {
  id: string;
  text: string;
  provider: ProviderId;
  modelId: string;
  createdAgent?: AgentSpec;
}

export const DEFAULT_MODEL_PRESETS: ProviderModelPreset[] = [
  { id: 'qwen3:8b', provider: 'ollama', label: 'Qwen 3 8B', recommended: true, installed: false },
  { id: 'mistral-small:24b-instruct-2501-q4_K_M', provider: 'ollama', label: 'Mistral Small 24B', recommended: true, installed: false },
  { id: 'deepseek-r1:8b', provider: 'ollama', label: 'DeepSeek R1 8B', recommended: true, installed: false }
];

export const EMPTY_USERMAP_TREE: UserMapNode = {
  id: 'root',
  label: 'UserMap',
  nodeType: 'root',
  children: []
};
