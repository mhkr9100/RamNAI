export type ProviderId = 'ollama' | 'openai' | 'anthropic' | 'google';

export type AuthSecretRefSource = 'env' | 'file' | 'exec';

export interface AuthSecretRef {
  source: AuthSecretRefSource;
  provider: string;
  id: string;
}

export interface ProviderAuthProfile {
  id: string;
  provider: ProviderId;
  label: string;
  description?: string | undefined;
  keyRef?: AuthSecretRef | undefined;
  tokenRef?: AuthSecretRef | undefined;
  isDefault?: boolean | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAuthSelection {
  provider: ProviderId;
  profileId: string | null;
}

export interface RetentionConfigInput {
  auditLogDays: number;
  chatDays: number | null;
  workDays: number | null;
  taskRunDays: number;
}

export interface RetentionConfig extends RetentionConfigInput {
  lastPurgeAt: string | null;
}

export interface AssistantProviderOverrideSettings {
  provider: ProviderId;
  modelId: string;
}

/** Runtime mode for Assistant/task execution. */
export type AgentMode = 'ollama' | 'bridge' | 'auto';

/** Workspace role (backend-only; desktop defaults to owner). */
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

/** Permission identifiers for RBAC. */
export type Permission =
  | 'create_agents'
  | 'run_tasks'
  | 'edit_context'
  | 'manage_settings'
  | 'delete_agents'
  | 'delete_groups'
  | 'delete_tasks'
  | 'export_audit'
  | 'create_support_bundle';

/** Role → allowed permissions. Owner has all. */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: ['create_agents', 'run_tasks', 'edit_context', 'manage_settings', 'delete_agents', 'delete_groups', 'delete_tasks', 'export_audit', 'create_support_bundle'],
  admin: ['create_agents', 'run_tasks', 'edit_context', 'manage_settings', 'delete_agents', 'delete_groups', 'delete_tasks', 'export_audit', 'create_support_bundle'],
  member: ['create_agents', 'run_tasks', 'edit_context'],
  viewer: []
};

export type ProviderStrategy =
  | { mode: 'local_first'; preferredLocalModelIds: string[]; fallbackProviders: ProviderId[] }
  | { mode: 'fixed'; provider: ProviderId; modelId: string }
  | { mode: 'user_override'; defaultProvider: ProviderId; defaultModelId: string };

export interface AgentSpec {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdBy: 'assistant';
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
    contextPaths: string[];
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
    source: 'assistant-create';
  };
}

export type TaskTarget =
  | { type: 'assistant' }
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

export type TaskRunStatus = 'claimed' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TaskRunRecord {
  id: string;
  taskId: string;
  taskTitle?: string;
  taskObjective?: string;
  taskMode?: TaskMode;
  status: TaskRunStatus;
  claimToken?: string;
  claimedAt?: string;
  leaseExpiresAt?: string;
  createdAt?: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  workerId?: string;
  attempt?: number;
  runIndex?: number;
  target?: TaskTarget;
  provider?: ProviderId;
  modelId?: string;
  summary?: string;
  lastError?: string;
  artifactIds?: string[];
  councilTrace?: Array<{ modelId: string; stage: 'worker' | 'revision' | 'judge'; output: string }>;
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

export type MemoryVisibility = 'private' | 'public';

export interface MemoryFact {
  id: string;
  category: MemoryCategory;
  label: string;
  value: string;
  confidence: number;
  visibility: MemoryVisibility;
  source: 'chat' | 'manual' | 'task' | 'council' | 'system';
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextTreeNode {
  id: string;
  label: string;
  value?: string;
  nodeType: 'root' | 'category' | 'cluster' | 'fact';
  children: ContextTreeNode[];
  visibility: MemoryVisibility;
  confidence?: number;
  protected?: boolean;
  source?: 'manual' | 'memory';
}

export interface ContextTreeState {
  privateTree: ContextTreeNode;
  publicTree: ContextTreeNode;
}

export type GroupRoutingMode = 'auto' | 'manual';

export interface GroupSpec {
  id: string;
  name: string;
  description?: string;
  memberAgentIds: string[];
  routingMode: GroupRoutingMode;
  autoRouteThreshold: number;
  defaultResponderAgentId?: string;
  autoRouting?: {
    enabled: boolean;
    lowConfidenceThreshold?: number;
    hintMessage?: string;
  };
}

export interface GroupRouteMetadata {
  mode: 'pinned' | 'auto' | 'fallback' | 'manual_hint' | 'direct' | 'mention' | 'hint';
  chosenAgentId?: string;
  chosenAgentName?: string;
  confidence?: number;
  reason: string;
  targetType?: 'agent' | 'group';
  targetIds?: string[];
  pinnedMentions?: string[];
}

export type ChatRouteMetadata = GroupRouteMetadata;

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
  route?: GroupRouteMetadata;
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
  /** Optional IANA timezone for task scheduling (e.g. "America/Los_Angeles"). Defaults to system. */
  timezone?: string;
}

export interface ProviderModelPreset {
  id: string;
  provider: ProviderId;
  label: string;
  recommended: boolean;
  installed: boolean;
}

export type OllamaModelInstallStatus = 'not_installed' | 'installing' | 'installed' | 'error';

export interface OllamaModelRuntimeStatus {
  id: string;
  label: string;
  status: OllamaModelInstallStatus;
  progress?: number | undefined;
  phase?: string | undefined;
  lastError?: string;
}

export interface OllamaRuntimeStatus {
  running: boolean;
  models: OllamaModelRuntimeStatus[];
}

/** Audit event types for compliance (no PII in payload). */
export type AuditEventKind =
  | 'agent_created'
  | 'agent_updated'
  | 'profile_updated'
  | 'task_run_started'
  | 'task_run_completed'
  | 'task_run_failed'
  | 'task_run_cancelled'
  | 'provider_selection_changed'
  | 'assistant_override_changed';

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  entityId?: string;
  entityType?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceConfig {
  enabled: boolean;
  wakeWord: string;
  preferredVoice: string;
  autoListen: boolean;
  ttsProvider: 'system' | 'elevenlabs' | 'openai';
}

export interface VoiceEvent {
  type: 'transcript' | 'response' | 'error';
  text: string;
  timestamp: number;
  agentId?: string | undefined;
}

export interface CapabilityDefinition {
  id: string;
  label: string;
  description: string;
  category: 'Skill' | 'Plugin' | 'MCP';
}

export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  { id: 'web_search', label: 'Web Search', description: 'Search the internet for real-time information', category: 'Skill' },
  { id: 'thinking', label: 'Thinking', description: 'Extended reasoning and analysis', category: 'Skill' },
  { id: 'code_execution', label: 'Code Execution', description: 'Run code in sandboxed environments', category: 'Skill' },
  { id: 'file_management', label: 'File Management', description: 'Read, write, and manage local files', category: 'Skill' },
  { id: 'shell', label: 'Shell Commands', description: 'Execute system shell commands', category: 'Skill' },
  { id: 'browser', label: 'Browser Automation', description: 'Navigate web pages and interact with elements', category: 'Skill' },
  { id: 'api_calls', label: 'API Integration', description: 'Make HTTP requests to external APIs', category: 'Plugin' },
  { id: 'mcp', label: 'MCP Protocol', description: 'Model Context Protocol tool integration', category: 'MCP' },
];

export type AssistantMode = 'ask' | 'create';

export interface AssistantRequest {
  mode: AssistantMode;
  message: string;
  contextTree: ContextTreeState;
  existingAgents: AgentSpec[];
  existingGroups: GroupSpec[];
}

export interface AssistantReply {
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

export function createEmptyContextTreeTree(label: string, visibility: MemoryVisibility): ContextTreeNode {
  return {
    id: `${visibility}-root`,
    label,
    nodeType: 'root',
    visibility,
    children: []
  };
}

export const EMPTY_CONTEXT_STATE: ContextTreeState = {
  privateTree: createEmptyContextTreeTree('Private', 'private'),
  publicTree: createEmptyContextTreeTree('Public', 'public')
};

export const EMPTY_PUBLIC_CONTEXT_TREE = EMPTY_CONTEXT_STATE.publicTree;
export const EMPTY_PRIVATE_CONTEXT_TREE = EMPTY_CONTEXT_STATE.privateTree;

export const EMPTY_CONTEXT_TREE: ContextTreeNode = {
  id: 'root',
  label: 'Context',
  nodeType: 'root',
  visibility: 'private',
  children: [EMPTY_CONTEXT_STATE.publicTree, EMPTY_CONTEXT_STATE.privateTree]
};
