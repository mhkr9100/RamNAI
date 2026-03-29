import { Notification, app, autoUpdater, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { channels } from './preload-api.js';
import {
  TaskCreateInput,
  buildTaskSpec,
  computeNextRun,
  isRecurring
} from './task-scheduling.js';
import {
  WorkspacePaths,
  WorkspaceTextEncoder,
  buildWorkspacePaths,
  syncStructuredExports as syncStructuredExportsToDisk,
  writeJsonFile,
  writeTextFile
} from './workspace-sync.js';
import { createBackupExport, createSupportBundle } from './local-bundles.js';
import { recoverInterruptedWork as recoverInterruptedWorkModule } from './scheduler-recovery.js';
import { startTaskRunHeartbeat } from './task-run-heartbeat.js';
import { setupTray, destroyTray } from './tray.js';
import { logger } from './logger.js';
import { WorkspaceEncryptionManager } from './workspace-security.js';
import type {
  AgentMode,
  AgentSpec,
  ArtifactMode,
  ArtifactRecord,
  ChatMessage,
  ChatRouteMetadata,
  ChatThread,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  OllamaRuntimeStatus,
  OllamaModelInstallStatus,
  Permission,
  AssistantRequest,
  AssistantProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderAuthSelection,
  ProviderId,
  RetentionConfigInput,
  TaskSpec,
  TaskRunRecord,
  ContextTreeNode,
  ContextTreeState,
  VoiceConfig,
  VoiceEvent,
  WorkItem
} from '@raman-ai/shared';
import { SqliteStorage } from '@raman-ai/storage';
import { LocalRuntimeAdapter, RuntimeWorkspaceManager, ProviderAuthStore, BridgeAgentManager, HeartbeatService, type SecretStoreCipher } from '@raman-ai/runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const runtime = new LocalRuntimeAdapter();
const runtimeWorkspace = new RuntimeWorkspaceManager();
const providerAuthStore = new ProviderAuthStore(createSecretStoreCipher());
const agentManager = new BridgeAgentManager();
let mainWindow: BrowserWindow | null = null;
let storage: SqliteStorage;
let workspaceSecurity: WorkspaceEncryptionManager;
let schedulerHandle: NodeJS.Timeout | null = null;
let processingDueTasks = false;
let workspaceReady = false;
let heartbeatService: HeartbeatService | null = null;
const TASK_RUN_LEASE_MS = 5 * 60 * 1000;
const TASK_RUN_HEARTBEAT_INTERVAL_MS = 30 * 1000;
const TASK_RUN_HARD_TIMEOUT_MS = TASK_RUN_LEASE_MS * 4;
const RETENTION_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ollamaModelState = new Map<string, OllamaModelRuntimeState>();
const DEFAULT_GROUP_ROUTING_LOW_CONFIDENCE_THRESHOLD = 0.55;
const USER_MAP_VISIBILITY_ORDER: Array<'public' | 'private'> = ['public', 'private'];
const EXPORT_PROVIDER_IDS: ProviderId[] = ['ollama', 'openai', 'anthropic', 'google'];
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let resolvedAgentModeForAuto: AgentMode = 'ollama'; // A5: resolved when stored mode is 'auto'

if (!hasSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

interface GroupRoutingDecision {
  agent: AgentSpec;
  mode: 'mention' | 'auto';
  confidence: number;
  pinnedMentions: string[];
  hintMessage?: string;
}

interface AgentChatInput {
  agentId: string;
  message: string;
  streamId?: string;
}

interface GroupChatInput {
  groupId: string;
  message: string;
  streamId?: string;
}

interface ProviderAuthUpsertInput {
  id?: string;
  provider: ProviderId;
  label: string;
  description?: string;
  apiKey?: string;
  token?: string;
  isDefault?: boolean;
}

interface ProviderAuthDeleteInput {
  provider: ProviderId;
  profileId: string;
}

interface ProviderAuthTestInput {
  provider: ProviderId;
  profileId: string;
  probeWithRuntime?: boolean;
}

interface OllamaModelRuntimeState {
  status: OllamaModelInstallStatus;
  progress?: number;
  phase?: string;
  lastError?: string;
}

interface WorkspaceSecurityIpcState {
  enabled: boolean;
  locked: boolean;
  ready: boolean;
}

const PLAIN_STORAGE_CIPHER = {
  id: 'plain',
  enabled: false,
  encrypt(value: string) {
    return value;
  },
  decrypt(value: string) {
    return value;
  },
  isEncrypted(_value: string) {
    return false;
  }
};

function createElectronSafeStorageCipher(): SecretStoreCipher {
  const api = safeStorage as unknown as {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): string | Buffer;
    decryptString(value: string | Buffer): string;
  };

  return {
    id: 'electron-safe-storage',
    encrypt(value: string): string {
      const encrypted = api.encryptString(value);
      return Buffer.isBuffer(encrypted)
        ? `buffer:${encrypted.toString('base64')}`
        : `string:${encrypted}`;
    },
    decrypt(value: string): string {
      if (value.startsWith('buffer:')) {
        return api.decryptString(Buffer.from(value.slice('buffer:'.length), 'base64'));
      }

      if (value.startsWith('string:')) {
        return api.decryptString(value.slice('string:'.length));
      }

      return api.decryptString(value);
    }
  };
}

function createFallbackSecretCipher(): SecretStoreCipher {
  const key = createHash('sha256')
    .update([os.homedir(), os.hostname(), process.platform, 'raman-ai'].join('|'))
    .digest();

  return {
    id: 'aes-256-gcm-fallback',
    encrypt(value: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return `aesgcm:${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`;
    },
    decrypt(value: string): string {
      if (!value.startsWith('aesgcm:')) {
        throw new Error('Unsupported secret envelope.');
      }

      const payload = Buffer.from(value.slice('aesgcm:'.length), 'base64');
      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
  };
}

function createSecretStoreCipher(): SecretStoreCipher {
  try {
    const api = safeStorage as unknown as { isEncryptionAvailable(): boolean };
    if (api.isEncryptionAvailable()) {
      return createElectronSafeStorageCipher();
    }
  } catch {
    // Fall back to a local envelope if Electron's keychain backend is not ready.
  }

  logger.warn('Electron safeStorage unavailable; using local AES envelope for provider secrets.', { area: 'auth' });
  return createFallbackSecretCipher();
}

function getMainProcessLogPath() {
  const baseDir = (() => {
    try {
      return app.getPath('userData');
    } catch {
      return process.cwd();
    }
  })();

  return path.join(baseDir, 'logs', 'main-process.log');
}

function logMainProcessIssue(kind: 'unhandledRejection' | 'uncaughtException' | 'navigationBlocked' | 'windowOpenBlocked', error: unknown, extra: Record<string, unknown> = {}) {
  const record = {
    kind,
    at: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...extra
  };

  logger.error('Uncaught exception', { error: String(record) });

  try {
    mkdirSync(path.dirname(getMainProcessLogPath()), { recursive: true });
    writeFileSync(getMainProcessLogPath(), `${JSON.stringify(record)}\n`, { flag: 'a' });
  } catch {
    // Best-effort logging only.
  }
}

function hardenWebContents(contents: BrowserWindow['webContents']) {
  contents.setWindowOpenHandler(({ url }) => {
    logMainProcessIssue('windowOpenBlocked', new Error('Blocked window.open request.'), { url });
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    logMainProcessIssue('navigationBlocked', new Error('Blocked navigation request.'), { url });
  });
}

app.on('web-contents-created', (_event, contents) => {
  hardenWebContents(contents);
});

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
});

process.on('unhandledRejection', (reason) => {
  logMainProcessIssue('unhandledRejection', reason);
});

process.on('uncaughtException', (error) => {
  logMainProcessIssue('uncaughtException', error);
  app.exit(1);
});

async function withRuntimeBridgeCompatibility<T>(action: () => Promise<T>): Promise<T> {
  return providerAuthStore.withRuntimeBridgeCompatibility(action);
}

function syncRuntimeConfig() {
  const activeStorage = requireWorkspaceReady();
  runtime.setAssistantProviderOverride(activeStorage.getAssistantProviderOverride());
  const stored = activeStorage.getAgentMode();
  runtime.setAgentMode(
    workspaceSecurity.isEncryptionEnabled()
      ? 'ollama'
      : stored === 'auto'
        ? resolvedAgentModeForAuto
        : stored
  );
}

function cloneContextTreeNode(node: ContextTreeNode, inheritedVisibility?: 'public' | 'private'): ContextTreeNode {
  const visibility = node.visibility ?? inheritedVisibility;
  return {
    ...node,
    ...(visibility ? { visibility } : {}),
    children: node.children.map((child) => cloneContextTreeNode(child, visibility))
  };
}

function normalizeContextTreeTree(tree: ContextTreeNode, visibility: 'public' | 'private'): ContextTreeNode {
  return cloneContextTreeNode(tree, visibility);
}

function normalizeContextTreeState(state: ContextTreeState): ContextTreeState {
  return {
    publicTree: normalizeContextTreeTree(state.publicTree, 'public'),
    privateTree: normalizeContextTreeTree(state.privateTree, 'private')
  };
}

function buildRouteMetadata(input: {
  mode: 'direct' | 'mention' | 'auto' | 'hint';
  targetType: 'agent' | 'group';
  targetIds: string[];
  confidence?: number;
  reason?: string;
  pinnedMentions?: string[];
}): ChatRouteMetadata {
  return {
    mode: input.mode,
    targetType: input.targetType,
    targetIds: input.targetIds,
    ...(input.targetIds[0] ? { chosenAgentId: input.targetIds[0] } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    reason: input.reason ?? 'Routing decision',
    ...(input.pinnedMentions?.length ? { pinnedMentions: input.pinnedMentions } : {})
  };
}

function tokenizeRoutingText(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function normalizeGroupAutoRouting(group: GroupSpec): GroupSpec {
  const enabled = group.autoRouting?.enabled ?? group.routingMode !== 'manual';
  const lowConfidenceThreshold = group.autoRouting?.lowConfidenceThreshold ?? group.autoRouteThreshold ?? DEFAULT_GROUP_ROUTING_LOW_CONFIDENCE_THRESHOLD;
  return {
    ...group,
    routingMode: enabled ? 'auto' : 'manual',
    autoRouteThreshold: lowConfidenceThreshold,
    autoRouting: {
      enabled,
      lowConfidenceThreshold,
      ...(group.autoRouting?.hintMessage ? { hintMessage: group.autoRouting.hintMessage } : {})
    }
  };
}

function normalizeGroupSpecs(groups: GroupSpec[]) {
  return groups.map((group) => normalizeGroupAutoRouting(group));
}

function resolveMentionedAgents(message: string, memberAgents: AgentSpec[]) {
  const mentions = [...message.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((match) => match[1] ?? '').filter(Boolean).map((mention) => mention.toLowerCase());
  if (mentions.length === 0) {
    return [] as AgentSpec[];
  }

  const resolved: AgentSpec[] = [];
  for (const mention of mentions) {
    const matched = memberAgents.find((agent) => {
      const slug = slugify(agent.name);
      const compact = agent.name.toLowerCase().replace(/\s+/g, '');
      return mention === slug || mention === compact || mention === agent.id.toLowerCase();
    });

    if (matched && !resolved.some((agent) => agent.id === matched.id)) {
      resolved.push(matched);
    }
  }

  return resolved.slice(0, 1);
}

function scoreGroupAgent(agent: AgentSpec, group: GroupSpec, message: string) {
  const tokens = new Set(tokenizeRoutingText([
    group.name,
    group.description ?? '',
    agent.name,
    agent.description,
    agent.persona.role,
    agent.persona.mission,
    agent.persona.systemInstructions,
    ...agent.skills,
    ...agent.tools
  ].join(' ')));
  const messageTokens = tokenizeRoutingText(message);
  let score = 0;

  for (const token of messageTokens) {
    if (tokens.has(token)) {
      score += token.length > 4 ? 2 : 1;
    }
  }

  const compactName = agent.name.toLowerCase().replace(/\s+/g, '');
  if (message.toLowerCase().includes(compactName)) {
    score += 4;
  }

  if (message.toLowerCase().includes(slugify(agent.name))) {
    score += 4;
  }

  if (group.memberAgentIds.includes(agent.id)) {
    score += 1;
  }

  return score;
}

function selectGroupRoutingDecision(group: GroupSpec, memberAgents: AgentSpec[], message: string): GroupRoutingDecision | null {
  const explicitMentions = resolveMentionedAgents(message, memberAgents);
  if (explicitMentions.length > 0) {
    const agent = explicitMentions[0];
    if (!agent) {
      return null;
    }
    return {
      agent,
      mode: 'mention',
      confidence: 1,
      pinnedMentions: [...message.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((match) => match[1] ?? '').filter(Boolean),
    };
  }

  if (group.routingMode === 'manual') {
    return null;
  }

  const scored = memberAgents
    .map((agent) => ({
      agent,
      score: scoreGroupAgent(agent, group, message)
    }))
    .sort((left, right) => right.score - left.score || left.agent.name.localeCompare(right.agent.name));

  const best = scored[0];
  if (!best) {
    return null;
  }

  const second = scored[1]?.score ?? 0;
  const confidence = best.score <= 0 ? 0 : Math.max(0, Math.min(1, best.score / Math.max(best.score + second + 2, 1)));
  const autoConfig = group.autoRouting;
  const lowConfidenceThreshold = autoConfig?.lowConfidenceThreshold ?? group.autoRouteThreshold ?? DEFAULT_GROUP_ROUTING_LOW_CONFIDENCE_THRESHOLD;
  const hintMessage = confidence < lowConfidenceThreshold
    ? autoConfig?.hintMessage ?? `Auto-routed to ${best.agent.name} with low confidence (${Math.round(confidence * 100)}%). Use @${best.agent.slug} to pin this group thread.`
    : undefined;

  return {
    agent: best.agent,
    mode: 'auto',
    confidence,
    pinnedMentions: [],
    ...(hintMessage ? { hintMessage } : {})
  };
}

let ollamaInstallJob: Promise<void> | null = null;

let cachedWorkspacePaths: WorkspacePaths | null = null;

function getWorkspacePaths(): WorkspacePaths {
  if (cachedWorkspacePaths) {
    return cachedWorkspacePaths;
  }

  const paths = buildWorkspacePaths(path.join(app.getPath('userData'), 'workspace'));
  cachedWorkspacePaths = paths;
  return paths;
}

function getDatabasePath() {
  return path.join(getWorkspacePaths().root, 'raman-ai.sqlite');
}

function getWorkspaceFileEncoder(): WorkspaceTextEncoder | undefined {
  if (!workspaceSecurity?.isEncryptionEnabled() || !workspaceSecurity.isUnlocked()) {
    return undefined;
  }

  return {
    enabled: true,
    encodeText(value: string) {
      return workspaceSecurity.encryptText(value);
    }
  };
}

function requireWorkspaceReady(): SqliteStorage {
  if (!workspaceReady) {
    throw new Error('Raman AI is locked. Unlock it to continue.');
  }

  return storage;
}

function getWorkspaceSecurityState(): WorkspaceSecurityIpcState {
  const state = workspaceSecurity.getState();
  return {
    enabled: state.enabled,
    locked: state.locked,
    ready: state.ready
  };
}

function shouldRunRetentionCleanup(lastPurgeAt: string | null | undefined): boolean {
  if (!lastPurgeAt) {
    return true;
  }

  const lastPurgeMs = Date.parse(lastPurgeAt);
  if (Number.isNaN(lastPurgeMs) || lastPurgeMs > Date.now()) {
    return true;
  }

  return (Date.now() - lastPurgeMs) >= RETENTION_PURGE_INTERVAL_MS;
}

function clearRuntimeWorkspaceMirror() {
  if (!workspaceReady) {
    return;
  }

  const snapshot = storage.getWorkspaceSnapshot();
  const plan = runtimeWorkspace.buildPlan({
    profile: snapshot.profile,
    contextTree: snapshot.contextTree,
    agents: snapshot.agents,
    groups: snapshot.groups,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts
  });

  rmSync(path.join(getWorkspacePaths().root, plan.rootDir), { recursive: true, force: true });
}

async function refreshStoredModels() {
  const models = await runtime.listModels();
  for (const model of models) {
    requireWorkspaceReady().updateModel(model);
  }
  return models;
}

async function getHealthStatus(agentManager: BridgeAgentManager): Promise<{
  ollama: { ready: boolean; available: boolean };
  runtimeBridge: { ready: boolean; version: string | null };
  storage: { ok: boolean };
  scheduler: { ok: boolean };
  metrics?: { taskRuns: ReturnType<SqliteStorage['getTaskRunMetrics']> };
}> {
  const [runtimeStatus, bridgeStatus] = await Promise.all([
    runtime.getStatus(),
    agentManager.getStatus()
  ]);
  let storageOk = false;
  let metrics: ReturnType<SqliteStorage['getTaskRunMetrics']> | undefined;
  try {
    const activeStorage = requireWorkspaceReady();
    activeStorage.getProfile();
    activeStorage.listTasks();
    storageOk = true;
    metrics = activeStorage.getTaskRunMetrics(30);
  } catch {
    storageOk = false;
  }
  return {
    ollama: { ready: runtimeStatus.ollamaReady, available: runtimeStatus.available },
    runtimeBridge: { ready: runtimeStatus.runtimeBridgeReady, version: bridgeStatus?.version ?? null },
    storage: { ok: storageOk },
    scheduler: { ok: true },
    ...(metrics ? { metrics: { taskRuns: metrics } } : {})
  };
}

async function getOllamaRuntimeStatus(): Promise<OllamaRuntimeStatus & { bridgeVersion: string | null }> {
  const [models, status, bridgeVersion] = await Promise.all([
    runtime.listModels(),
    runtime.getStatus(),
    runtime.getBridgeVersion()
  ]);
  const byId = new Map(models.map((model) => [model.id, model]));

  const entries = Array.from(byId.values()).map((model) => {
    const state = ollamaModelState.get(model.id);
    const derivedStatus: OllamaModelInstallStatus =
      model.installed ? 'installed' : state?.status ?? 'not_installed';

    return {
      id: model.id,
      label: model.label,
      status: derivedStatus,
      ...(state?.progress !== undefined ? { progress: state.progress } : {}),
      ...(state?.phase ? { phase: state.phase } : {}),
      ...(state?.lastError ? { lastError: state.lastError } : {})
    };
  });

  return {
    running: status.ollamaReady,
    models: entries,
    bridgeVersion
  };
}

function trackOllamaLine(modelId: string, line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  const percentMatch = trimmed.match(/(\d{1,3})\s*%/);
  const percent = percentMatch ? Math.max(0, Math.min(100, Number(percentMatch[1]))) : undefined;
  const next: OllamaModelRuntimeState = {
    ...(ollamaModelState.get(modelId) ?? { status: 'installing' }),
    status: 'installing',
    phase: trimmed.slice(0, 120),
    ...(percent !== undefined ? { progress: percent } : {})
  };
  ollamaModelState.set(modelId, next);
}

async function pullOllamaModel(modelId: string) {
  ollamaModelState.set(modelId, { status: 'installing', progress: 0, phase: 'starting' });

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ollama', ['pull', modelId], { stdio: ['ignore', 'pipe', 'pipe'] });

    const handleChunk = (chunk: unknown) => {
      const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
      for (const line of text.split('\n')) {
        trackOllamaLine(modelId, line);
      }
    };

    child.stdout?.on('data', handleChunk);
    child.stderr?.on('data', handleChunk);

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ollama pull exited with code ${code ?? 'unknown'}`));
    });
  });

  ollamaModelState.set(modelId, { status: 'installed', progress: 100, phase: 'installed' });
}

async function ensureDefaultOllamaModelsInstalled() {
  if (ollamaInstallJob) {
    return;
  }

  ollamaInstallJob = (async () => {
  const status = await runtime.getStatus();
  if (!status.ollamaReady) {
    throw new Error('Ollama runtime is not reachable. Start Ollama before installing models.');
  }

    try {
      // Fail fast with a descriptive error if the CLI is missing.
      await execFileAsync('ollama', ['--version']);
    } catch {
      throw new Error('Ollama CLI is not available. Install Ollama and ensure the `ollama` command is on PATH.');
    }

  const models = await runtime.listModels();
  for (const preset of models.filter((model) => model.recommended)) {
    if (preset.installed) {
      ollamaModelState.set(preset.id, { status: 'installed', progress: 100, phase: 'installed' });
      continue;
    }

    try {
      await pullOllamaModel(preset.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ollamaModelState.set(preset.id, { status: 'error', lastError: message, phase: 'error' });
    }
  }
  })().finally(() => {
    ollamaInstallJob = null;
  });

  await ollamaInstallJob;
}

const DEFAULT_LITE_LIMIT = 100;

async function buildSnapshot(options?: { lite?: boolean }) {
  const activeStorage = requireWorkspaceReady();
  const limits = options?.lite
    ? { tasksLimit: DEFAULT_LITE_LIMIT, workItemsLimit: DEFAULT_LITE_LIMIT, chatThreadsLimit: DEFAULT_LITE_LIMIT }
    : undefined;
  const snapshot = activeStorage.getWorkspaceSnapshot(limits);
  const [runtimeStatus, models] = await Promise.all([runtime.getStatus(), refreshStoredModels()]);

  return {
    profile: snapshot.profile,
    agents: snapshot.agents,
    groups: snapshot.groups,
    chatThreads: snapshot.chatThreads,
    tasks: snapshot.tasks,
    taskRuns: snapshot.taskRuns,
    workItems: snapshot.workItems,
    artifacts: snapshot.artifacts,
    contextTree: snapshot.contextTree,
    publicContextTree: snapshot.publicContextTree,
    privateContextTree: snapshot.privateContextTree,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts,
    models,
    runtime: runtimeStatus,
    counts: snapshot.counts
  };
}

function syncStructuredExports() {
  if (!workspaceReady) {
    return;
  }

  if (workspaceSecurity.isEncryptionEnabled()) {
    clearRuntimeWorkspaceMirror();
  }

  syncStructuredExportsToDisk(getWorkspacePaths(), storage.getWorkspaceSnapshot(), runtimeWorkspace, {
    encoder: getWorkspaceFileEncoder(),
    disableRuntimeWorkspaceMirror: workspaceSecurity.isEncryptionEnabled()
  });
}

async function buildLocalBundleContext(agentManager: BridgeAgentManager) {
  const activeStorage = requireWorkspaceReady();
  const workspacePaths = getWorkspacePaths();
  const snapshot = activeStorage.getWorkspaceSnapshot();
  const textEncoder = getWorkspaceFileEncoder();
  const [providerProfiles, runtimeStatus, ollamaStatus, health] = await Promise.all([
    providerAuthStore.listProfiles(),
    runtime.getStatus(),
    getOllamaRuntimeStatus(),
    getHealthStatus(agentManager)
  ]);

  return {
    workspacePaths,
    snapshot,
    providerProfiles,
    providerSelections: EXPORT_PROVIDER_IDS.map((provider) => activeStorage.getProviderAuthSelection(provider) ?? { provider, profileId: null }),
    assistantOverride: activeStorage.getAssistantProviderOverride(),
    runtimeStatus,
    ollamaStatus,
    health,
    auditLogJson: activeStorage.exportAuditLog('json', 5000),
    schemaVersion: activeStorage.getSchemaVersion(),
    databasePath: getDatabasePath(),
    userDataPath: app.getPath('userData'),
    mainProcessLogPath: getMainProcessLogPath(),
    repoRoot: REPO_ROOT,
    runtimeWorkspace,
    appInfo: {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      processVersions: process.versions
    },
    ...(textEncoder ? { textEncoder } : {})
  };
}

function collectFactIdsFromTree(node: ContextTreeNode): Set<string> {
  const ids = new Set<string>();
  if (node.nodeType === 'fact') {
    ids.add(node.id);
  }
  for (const child of node.children) {
    for (const id of collectFactIdsFromTree(child)) {
      ids.add(id);
    }
  }
  return ids;
}

function collectAllFactIdsFromState(state: ContextTreeState): Set<string> {
  const ids = new Set<string>();
  for (const id of collectFactIdsFromTree(state.publicTree)) ids.add(id);
  for (const id of collectFactIdsFromTree(state.privateTree)) ids.add(id);
  return ids;
}

function upsertFactsIntoTree(tree: ContextTreeState, facts: MemoryFact[]): ContextTreeState {
  const nextTree = normalizeContextTreeState(tree);
  const categoryRoots = {
    public: new Map<string, ContextTreeNode>(),
    private: new Map<string, ContextTreeNode>()
  };

  for (const child of nextTree.publicTree.children) {
    if (child.nodeType === 'category') {
      categoryRoots.public.set(child.label, child);
    }
  }

  for (const child of nextTree.privateTree.children) {
    if (child.nodeType === 'category') {
      categoryRoots.private.set(child.label, child);
    }
  }

  for (const fact of facts) {
    const visibility = fact.visibility ?? 'public';
    const root = visibility === 'public' ? nextTree.publicTree : nextTree.privateTree;
    const categoryMap = categoryRoots[visibility];
    let categoryNode = categoryMap.get(fact.category);
    if (!categoryNode) {
      categoryNode = {
        id: `category-${visibility}-${slugify(fact.category)}`,
        label: fact.category,
        nodeType: 'category',
        children: [],
        source: 'memory',
        visibility
      };
      root.children.push(categoryNode);
      categoryMap.set(fact.category, categoryNode);
    }

    const existing = categoryNode.children.find((child) => child.label === fact.label);
    if (existing?.protected) {
      continue;
    }

    if (existing) {
      existing.value = fact.value;
      existing.confidence = fact.confidence;
      existing.source = 'memory';
      existing.nodeType = 'fact';
      existing.visibility = visibility;
      continue;
    }

    categoryNode.children.push({
      id: fact.id,
      label: fact.label,
      value: fact.value,
      nodeType: 'fact',
      confidence: fact.confidence,
      source: 'memory',
      visibility,
      children: []
    });
  }

  for (const root of [nextTree.publicTree, nextTree.privateTree]) {
    root.children.sort((left, right) => left.label.localeCompare(right.label));
    for (const category of root.children) {
      category.children.sort((left, right) => left.label.localeCompare(right.label));
    }
  }

  return nextTree;
}

async function mergeAndPersistMemoryFacts(newFacts: MemoryFact[]) {
  if (newFacts.length === 0) return storage.getContextTree();
  const normalizedFacts = newFacts.map((fact) => ({
    ...fact,
    visibility: fact.visibility ?? 'public'
  }));
  storage.upsertMemoryFacts(normalizedFacts);
  const nextTree = upsertFactsIntoTree(storage.getContextTree(), storage.listMemoryFacts());
  storage.saveContextTree(nextTree);
  syncStructuredExports();
  return nextTree;
}

async function extractAndPersistMemories(source: MemoryFact['source'], sourceRef: string, text: string) {
  try {
    const facts = await runtime.extractMemoryFacts(source, sourceRef, text, storage.listMemoryFacts());
    await mergeAndPersistMemoryFacts(facts);
  } catch (error) {
    logger.warn('Memory extraction skipped', { error: String(error) });
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'item';
}

function makeChatMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input
  };
}

function findOrCreateThread(targetType: ChatThread['targetType'], targetId: string, title: string) {
  const existing = storage.listChatThreads().find((thread) => thread.targetType === targetType && thread.targetId === targetId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: randomUUID(),
    targetType,
    targetId,
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  storage.upsertChatThread(thread);
  return thread;
}

function appendThreadMessages(thread: ChatThread, messages: ChatMessage[]) {
  const next: ChatThread = {
    ...thread,
    updatedAt: new Date().toISOString(),
    messages: [...thread.messages, ...messages]
  };
  storage.upsertChatThread(next);
  syncStructuredExports();
  return next;
}

function formatThreadHistory(thread: ChatThread) {
  return thread.messages
    .slice(-12)
    .map((message) => {
      const author = message.authorLabel ? ` (${message.authorLabel})` : '';
      return `${message.role.toUpperCase()}${author}: ${message.text}`;
    })
    .join('\n');
}

function buildEphemeralTask(input: { target: TaskSpec['target']; objective: string }): TaskSpec {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: 'Ad hoc chat execution',
    objective: input.objective,
    mode: 'task',
    target: input.target,
    schedule: { kind: 'once', runAt: now, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    outputPolicy: {
      saveResult: true,
      artifactMode: 'none',
      notificationMode: 'none',
      defaultSendToChat: false
    },
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    nextRunAt: now,
    runCount: 0,
    artifactIds: []
  };
}

function buildTaskRunRecord(task: TaskSpec, runIndex: number, startedAt: string): TaskRunRecord {
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(Date.parse(startedAt) + TASK_RUN_LEASE_MS).toISOString();
  return {
    id: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    taskObjective: task.objective,
    taskMode: task.mode,
    status: 'claimed',
    claimToken,
    claimedAt: startedAt,
    leaseExpiresAt,
    workerId: 'desktop-main',
    attempt: runIndex,
    runIndex,
    target: task.target,
    createdAt: startedAt,
    updatedAt: startedAt,
    artifactIds: []
  };
}

function activateTaskRun(run: TaskRunRecord, startedAt: string): TaskRunRecord {
  const attempt = run.attempt ?? run.runIndex;
  return {
    ...run,
    status: 'running',
    startedAt: run.startedAt ?? startedAt,
    updatedAt: startedAt,
    leaseExpiresAt: new Date(Date.parse(startedAt) + TASK_RUN_LEASE_MS).toISOString(),
    workerId: run.workerId ?? 'desktop-main',
    ...(attempt !== undefined ? { attempt } : {})
  };
}

function completeTaskRun(run: TaskRunRecord, input: {
  status: TaskRunRecord['status'];
  completedAt: string;
  provider?: TaskRunRecord['provider'];
  modelId?: string;
  summary?: string;
  error?: string;
  artifactIds?: string[];
  councilTrace?: TaskRunRecord['councilTrace'];
}): TaskRunRecord {
  return {
    ...run,
    status: input.status,
    updatedAt: input.completedAt,
    completedAt: input.completedAt,
    leaseExpiresAt: input.completedAt,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.error ? { lastError: input.error } : {}),
    ...(input.artifactIds ? { artifactIds: input.artifactIds } : {}),
    ...(input.councilTrace ? { councilTrace: input.councilTrace } : {})
  };
}

function buildAgentChatObjective(agent: AgentSpec, thread: ChatThread, message: string) {
  const history = formatThreadHistory(thread);
  return [
    `Continue the ongoing chat with the chatbot "${agent.name}".`,
    history ? `Recent conversation:\n${history}` : '',
    `Latest user message:\n${message}`,
    'Respond directly to the user in-chat. Keep continuity with the prior messages.'
  ].filter(Boolean).join('\n\n');
}

function parseMentions(message: string) {
  return [...message.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((match) => match[1] ?? '').filter(Boolean);
}

async function sendAgentChat(input: AgentChatInput) {
  syncRuntimeConfig();
  const snapshot = storage.getWorkspaceSnapshot();
  const agent = snapshot.agents.find((candidate) => candidate.id === input.agentId);
  if (!agent) {
    throw new Error('Chatbot not found.');
  }

  const thread = findOrCreateThread('agent', agent.id, agent.name);
  const route = buildRouteMetadata({
    mode: 'direct',
    targetType: 'agent',
    targetIds: [agent.id],
    confidence: 1,
    reason: 'Direct agent chat'
  });
  const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You', route });
  const withUser = appendThreadMessages(thread, [userMessage]);
  const result = await withRuntimeBridgeCompatibility(() => runtime.executeTask(buildEphemeralTask({
    target: { type: 'agent', agentId: agent.id },
    objective: buildAgentChatObjective(agent, withUser, input.message.trim())
  }), {
    contextTree: snapshot.contextTree,
    agents: snapshot.agents,
    groups: snapshot.groups
  }));

  const assistantMessage = makeChatMessage({
    role: 'assistant',
    text: result.text,
    authorId: agent.id,
    authorLabel: agent.name,
    provider: result.provider,
    modelId: result.modelId,
    route
  });
  const nextThread = appendThreadMessages(withUser, [assistantMessage]);
  await extractAndPersistMemories('chat', `agent:${agent.id}:${assistantMessage.id}`, `${input.message}\n\n${result.text}`);
  return {
    thread: nextThread,
    newMessages: [userMessage, assistantMessage]
  };
}

async function sendGroupChat(input: GroupChatInput) {
  syncRuntimeConfig();
  const snapshot = storage.getWorkspaceSnapshot();
  const group = snapshot.groups.find((candidate) => candidate.id === input.groupId);
  if (!group) {
    throw new Error('Group not found.');
  }
  const routingGroup = normalizeGroupAutoRouting(group);

  const memberAgents = snapshot.agents.filter((agent) => routingGroup.memberAgentIds.includes(agent.id));
  const routingDecision = selectGroupRoutingDecision(routingGroup, memberAgents, input.message.trim());
  const thread = findOrCreateThread('group', routingGroup.id, routingGroup.name);
  const mentions = parseMentions(input.message);
  const userRoute = routingDecision
    ? buildRouteMetadata({
        mode: routingDecision.mode,
        targetType: 'group',
        targetIds: [routingDecision.agent.id],
        confidence: routingDecision.confidence,
        reason: routingDecision.mode === 'mention' ? 'Explicit @mention pin' : 'Auto-routed best fit',
        pinnedMentions: routingDecision.pinnedMentions
      })
    : undefined;
  const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You', mentions, ...(userRoute ? { route: userRoute } : {}) });
  const withUser = appendThreadMessages(thread, [userMessage]);

  if (!routingDecision) {
    const systemMessage = makeChatMessage({
      role: 'system',
      text: routingGroup.routingMode === 'manual'
        ? 'Manual routing is enabled for this group. Mention one member chatbot with @chatbot-name to route the message.'
        : 'No eligible member chatbots are configured for this group yet.',
      authorLabel: 'System'
    });
    const nextThread = appendThreadMessages(withUser, [systemMessage]);
    return {
      thread: nextThread,
      newMessages: [userMessage, systemMessage]
    };
  }

  const assistantRoute = buildRouteMetadata({
    mode: routingDecision.mode,
    targetType: 'group',
    targetIds: [routingDecision.agent.id],
    confidence: routingDecision.confidence,
    reason: routingDecision.mode === 'mention' ? 'Explicit @mention pin' : 'Auto-routed best fit',
    pinnedMentions: routingDecision.pinnedMentions
  });

  const assistantMessages: ChatMessage[] = [];
  let activeThread = withUser;

  if (routingDecision.hintMessage) {
    const systemMessage = makeChatMessage({
      role: 'system',
      text: routingDecision.hintMessage,
      authorLabel: 'System',
      route: buildRouteMetadata({
        mode: 'hint',
        targetType: 'group',
        targetIds: [routingDecision.agent.id],
        confidence: routingDecision.confidence,
        reason: 'Low-confidence auto route'
      })
    });
    activeThread = appendThreadMessages(activeThread, [systemMessage]);
  }

  const result = await withRuntimeBridgeCompatibility(() => runtime.executeTask(buildEphemeralTask({
      target: { type: 'agent', agentId: routingDecision.agent.id },
      objective: [
        `You are replying as "${routingDecision.agent.name}" inside the group "${group.name}".`,
        formatThreadHistory(activeThread),
        `Latest group message:\n${input.message.trim()}`,
        'Reply only for your own role and perspective.'
      ].filter(Boolean).join('\n\n')
    }), {
      contextTree: snapshot.contextTree,
      agents: snapshot.agents,
      groups: snapshot.groups
    }));

  const assistantMessage = makeChatMessage({
    role: 'assistant',
    text: result.text,
    authorId: routingDecision.agent.id,
    authorLabel: routingDecision.agent.name,
    provider: result.provider,
    modelId: result.modelId,
    route: assistantRoute
  });
  activeThread = appendThreadMessages(activeThread, [assistantMessage]);
  assistantMessages.push(assistantMessage);

  await extractAndPersistMemories('chat', `group:${group.id}:${userMessage.id}`, input.message.trim());
  return {
    thread: activeThread,
    newMessages: [userMessage, ...assistantMessages]
  };
}

function makeTaskBase(task: TaskSpec) {
  const {
    providerOverride,
    council,
    startedAt,
    completedAt,
    lastRunAt,
    nextRunAt,
    lastError,
    resultSummary,
    ...rest
  } = task;

  return {
    ...rest,
    ...(providerOverride ? { providerOverride } : {}),
    ...(council ? { council } : {})
  };
}

function createArtifactRecords(task: TaskSpec, workItemId: string, result: { text: string; councilTrace?: Array<{ modelId: string; stage: string; output: string }> }, mode: ArtifactMode) {
  const paths = getWorkspacePaths();
  const encoder = getWorkspaceFileEncoder();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(paths.artifacts, task.id, stamp);
  mkdirSync(runDir, { recursive: true });

  const artifacts: ArtifactRecord[] = [];

  if (mode === 'markdown' || mode === 'both') {
    const relativePath = path.relative(paths.root, path.join(runDir, 'result.md'));
    writeTextFile(path.join(runDir, 'result.md'), `${result.text}\n`, encoder);
    artifacts.push({
      id: randomUUID(),
      title: `${task.title} Result`,
      kind: 'markdown',
      relativePath,
      workItemId,
      taskId: task.id,
      createdAt: new Date().toISOString()
    });
  }

  if (mode === 'json' || mode === 'both') {
    const relativePath = path.relative(paths.root, path.join(runDir, 'result.json'));
    writeJsonFile(path.join(runDir, 'result.json'), {
      taskId: task.id,
      title: task.title,
      output: result.text,
      councilTrace: result.councilTrace ?? []
    }, encoder);
    artifacts.push({
      id: randomUUID(),
      title: `${task.title} Structured Output`,
      kind: 'json',
      relativePath,
      workItemId,
      taskId: task.id,
      createdAt: new Date().toISOString()
    });
  }

  for (const artifact of artifacts) {
    storage.upsertArtifact(artifact);
  }

  return artifacts;
}

function maybeNotify(task: TaskSpec, message: string) {
  if (task.outputPolicy.notificationMode === 'desktop' || task.outputPolicy.notificationMode === 'both') {
    new Notification({
      title: `Task ${task.status === 'failed' ? 'failed' : 'completed'}: ${task.title}`,
      body: message.slice(0, 160)
    }).show();
  }
}

async function executeDueTask(task: TaskSpec) {
  const startedAt = new Date().toISOString();
  const workItemId = randomUUID();
  const attempt = storage.nextTaskRunAttempt(task.id);
  const claimedTaskRun = buildTaskRunRecord(task, attempt, startedAt);
  const runningTaskRun = activateTaskRun(claimedTaskRun, startedAt);
  if (!runningTaskRun.claimToken) {
    throw new Error('Missing claim token for task run.');
  }
  const runningTask: TaskSpec = {
    ...makeTaskBase(task),
    status: 'running',
    startedAt,
    updatedAt: startedAt
  };

  const runningWorkItem: WorkItem = {
    id: workItemId,
    type: task.mode === 'council' ? 'council' : 'task',
    title: task.title,
    status: 'running',
    sourceTaskId: task.id,
    createdAt: startedAt,
    updatedAt: startedAt,
    artifactIds: [],
    ...(task.target.type === 'agent' ? { sourceAgentId: task.target.agentId } : {})
  };

  if (storage.listActiveTaskRuns(task.id).length > 0) {
    return;
  }

  storage.upsertTask(runningTask);
  storage.upsertTaskRun(claimedTaskRun);
  storage.upsertTaskRun(runningTaskRun);
  storage.upsertWorkItem(runningWorkItem);
  syncStructuredExports();

  let heartbeatStopped = false;
  const stopHeartbeat = () => {
    if (heartbeatStopped) return;
    heartbeatStopped = true;
    heartbeat.stop();
  };
  const heartbeat = startTaskRunHeartbeat({
    storage,
    runId: runningTaskRun.id,
    claimToken: runningTaskRun.claimToken,
    leaseMs: TASK_RUN_LEASE_MS,
    intervalMs: TASK_RUN_HEARTBEAT_INTERVAL_MS,
    hardTimeoutMs: TASK_RUN_HARD_TIMEOUT_MS
  });

  try {
    syncRuntimeConfig();
    const snapshot = storage.getWorkspaceSnapshot();
    const result = await withRuntimeBridgeCompatibility(() => runtime.executeTask(task, {
      contextTree: snapshot.contextTree,
      agents: snapshot.agents,
      groups: snapshot.groups
    }));
    const completedAt = new Date().toISOString();
    stopHeartbeat();

    // If another run has become active for this task, skip persisting to avoid duplicates.
    const activeRuns = storage.listActiveTaskRuns(task.id, new Date());
    const stale = activeRuns.some((run) => run.id !== runningTaskRun.id);
    if (stale) {
      const staleMessage = 'Stale run: lease expired or rerun occurred before commit.';
      storage.upsertTaskRun({
        ...runningTaskRun,
        status: 'cancelled',
        completedAt,
        leaseExpiresAt: completedAt,
        lastError: staleMessage,
        updatedAt: completedAt
      });
      storage.upsertWorkItem({
        ...runningWorkItem,
        status: 'cancelled',
        updatedAt: completedAt,
        lastError: staleMessage
      });
      syncStructuredExports();
      return;
    }

    const artifacts = createArtifactRecords(task, workItemId, result, task.outputPolicy.artifactMode);
    const nextRunAt = isRecurring(task.schedule) ? computeNextRun(task.schedule, new Date()).toISOString() : undefined;
    const nextStatus: TaskSpec['status'] = isRecurring(task.schedule) ? 'scheduled' : 'done';

    const completedTask: TaskSpec = {
      ...makeTaskBase(task),
      status: nextStatus,
      updatedAt: completedAt,
      startedAt,
      completedAt,
      lastRunAt: completedAt,
      runCount: task.runCount + 1,
      resultSummary: result.text,
      artifactIds: artifacts.map((artifact) => artifact.id),
      ...(nextRunAt ? { nextRunAt } : {})
    };

    const completedWorkItem: WorkItem = {
      ...runningWorkItem,
      status: 'done',
      updatedAt: completedAt,
      summary: result.text,
      artifactIds: artifacts.map((artifact) => artifact.id)
    };

    storage.upsertTask(completedTask);
    storage.upsertTaskRun(completeTaskRun(runningTaskRun, {
      status: 'done',
      completedAt,
      provider: result.provider,
      modelId: result.modelId,
      summary: result.text,
      artifactIds: artifacts.map((artifact) => artifact.id),
      councilTrace: result.councilTrace
    }));
    storage.upsertWorkItem(completedWorkItem);
    await extractAndPersistMemories(task.mode === 'council' ? 'council' : 'task', `task:${task.id}:${completedAt}`, result.text);
    syncStructuredExports();
    maybeNotify(completedTask, result.text);
  } catch (error) {
    const completedAt = new Date().toISOString();
    stopHeartbeat();

    const activeRuns = storage.listActiveTaskRuns(task.id, new Date());
    const stale = activeRuns.some((run) => run.id !== runningTaskRun.id);
    if (stale) {
      const staleMessage = 'Stale run: lease expired or rerun occurred before failure commit.';
      storage.upsertTaskRun({
        ...runningTaskRun,
        status: 'cancelled',
        completedAt,
        leaseExpiresAt: completedAt,
        lastError: staleMessage,
        updatedAt: completedAt
      });
      storage.upsertWorkItem({
        ...runningWorkItem,
        status: 'cancelled',
        updatedAt: completedAt,
        lastError: staleMessage
      });
      syncStructuredExports();
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const recurring = isRecurring(task.schedule);

    const failedTask: TaskSpec = {
      ...makeTaskBase(task),
      status: recurring ? 'scheduled' : 'failed',
      updatedAt: completedAt,
      startedAt,
      completedAt,
      lastRunAt: completedAt,
      runCount: task.runCount + 1,
      lastError: message,
      artifactIds: [],
      ...((recurring ? computeNextRun(task.schedule, new Date()).toISOString() : task.nextRunAt) ? { nextRunAt: recurring ? computeNextRun(task.schedule, new Date()).toISOString() : task.nextRunAt } : {})
    };

    const failedWorkItem: WorkItem = {
      ...runningWorkItem,
      status: 'failed',
      updatedAt: completedAt,
      lastError: message
    };

    storage.upsertTask(failedTask);
    storage.upsertTaskRun(completeTaskRun(runningTaskRun, {
      status: 'failed',
      completedAt,
      error: message
    }));
    storage.upsertWorkItem(failedWorkItem);
    syncStructuredExports();
    maybeNotify({ ...failedTask, status: 'failed' }, message);
  } finally {
    // Ensure heartbeat is not left running if runtime throws synchronously.
    stopHeartbeat();
  }
}

async function processDueTasks() {
  if (processingDueTasks) return;
  processingDueTasks = true;

  try {
    const now = Date.now();
    const dueTasks = storage
      .listTasks()
      .filter((task) => {
        if (task.status === 'scheduled' || task.status === 'queued') {
          if (!task.nextRunAt) return false;
          return Date.parse(task.nextRunAt) <= now;
        }

        if (task.status === 'running') {
          // Only resume "running" tasks once their lease is no longer active.
          const dueAt = task.nextRunAt ?? task.startedAt ?? task.updatedAt ?? task.createdAt;
          const due = dueAt ? Date.parse(dueAt) <= now : true;
          return due && storage.listActiveTaskRuns(task.id, new Date(now)).length === 0;
        }

        return false;
      })
      .sort((left, right) => Date.parse(left.nextRunAt ?? left.createdAt) - Date.parse(right.nextRunAt ?? right.createdAt));

    for (const task of dueTasks) {
      if (storage.listActiveTaskRuns(task.id).length > 0) {
        continue;
      }
      await executeDueTask(task);
    }
  } finally {
    processingDueTasks = false;
  }
}

function deleteWorkItemArtifacts(workItemId: string) {
  const paths = getWorkspacePaths();
  const artifacts = storage.listArtifacts().filter((artifact) => artifact.workItemId === workItemId);

  for (const artifact of artifacts) {
    rmSync(path.join(paths.root, artifact.relativePath), { force: true });
    storage.deleteArtifact(artifact.id);
  }
}

function deleteArtifactsForMissingWorkItems() {
  const paths = getWorkspacePaths();
  const workItemIds = new Set(storage.listWorkItems().map((item) => item.id));
  const orphanedArtifacts = storage.listArtifacts().filter((artifact) => !workItemIds.has(artifact.workItemId));

  for (const artifact of orphanedArtifacts) {
    rmSync(path.join(paths.root, artifact.relativePath), { force: true });
    storage.deleteArtifact(artifact.id);
  }
}

async function openArtifact(artifactId: string) {
  const artifact = requireWorkspaceReady().getArtifact(artifactId);
  if (!artifact) {
    throw new Error('Artifact not found.');
  }

  const paths = getWorkspacePaths();
  const targetPath = path.join(paths.root, artifact.relativePath);
  let openPathTarget = targetPath;
  if (workspaceSecurity.isEncryptionEnabled()) {
    const fileContent = readFileSync(targetPath, 'utf8');
    if (workspaceSecurity.isEncryptedText(fileContent)) {
      const decryptedDir = path.join(app.getPath('temp'), 'raman-ai-decrypted');
      mkdirSync(decryptedDir, { recursive: true });
      openPathTarget = path.join(decryptedDir, `${artifact.id}-${path.basename(targetPath)}`);
      writeFileSync(openPathTarget, workspaceSecurity.decryptText(fileContent), 'utf8');
    }
  }

  const result = await shell.openPath(openPathTarget);
  if (result) {
    throw new Error(result);
  }

  return { ok: true as const };
}

function checkForAppUpdates() {
  if (!app.isPackaged) {
    return { ok: false as const, message: 'Auto-update disabled in development mode.' };
  }

  try {
    autoUpdater.checkForUpdates();
    return { ok: true as const, message: 'Checking for updates...' };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  try {
    const server = 'https://update.electronjs.org';
    // Read owner/repo from package.json build.publish config to avoid hardcoding personal identifiers.
    const owner = process.env.WORKSPACE_UPDATE_OWNER ?? 'YOUR_GITHUB_USERNAME';
    const repo = process.env.WORKSPACE_UPDATE_REPO ?? 'raman-ai';
    const feed = `${server}/${owner}/${repo}/${process.platform}-${process.arch}/${app.getVersion()}`;
    autoUpdater.setFeedURL({ url: feed });

    autoUpdater.on('update-available', () => {
      console.info('[auto-update] Update available.');
    });

    autoUpdater.on('update-not-available', () => {
      console.info('[auto-update] No update available.');
    });

    autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
      const notification = new Notification({
        title: 'Update Ready',
        body: `Raman AI ${releaseName ?? 'update'} is ready. Click to restart and install.`
      });

      notification.on('click', () => {
        try {
          autoUpdater.quitAndInstall();
        } catch (error) {
          console.warn('[auto-update] Could not restart for update:', error);
        }
      });

      notification.show();
      console.info('[auto-update] Update downloaded.', releaseNotes ?? '');
    });

    autoUpdater.on('error', (error) => {
      logger.warn('Auto-update error', { message: error.message, area: 'auto-update' });
    });
  } catch (error) {
    logger.warn('Auto-update setup failed', { error: String(error), area: 'auto-update' });
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#08090a',
    title: 'Raman AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.WORKSPACE_RENDERER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function recoverInterruptedWork() {
  recoverInterruptedWorkModule(storage, new Date());
}

function requirePermission(permission: Permission): void {
  if (!requireWorkspaceReady().hasPermission(permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

function rewriteWorkspaceArtifactFiles(encrypt: boolean) {
  if (!workspaceReady) {
    return;
  }

  const paths = getWorkspacePaths();
  for (const artifact of storage.listArtifacts()) {
    const absolutePath = path.join(paths.root, artifact.relativePath);
    try {
      const raw = readFileSync(absolutePath, 'utf8');
      const plaintext = workspaceSecurity.isEncryptedText(raw) ? workspaceSecurity.decryptText(raw) : raw;
      const next = encrypt ? workspaceSecurity.encryptText(plaintext) : plaintext;
      writeFileSync(absolutePath, next, 'utf8');
    } catch {
      // Best-effort rewrite; missing artifacts should not block workspace unlock/toggle.
    }
  }
}

async function initializeWorkspaceStorage() {
  storage = new SqliteStorage(getDatabasePath(), {
    textCipher: workspaceSecurity.getStorageCipher()
  });
  workspaceReady = true;
  runtime.setRemoteProviderAuthResolver(async (provider) => {
    const selection = storage.getProviderAuthSelection(provider);
    const resolved = await providerAuthStore.resolveProfile(provider, selection?.profileId ?? null);
    if (!resolved) {
      return null;
    }

    return {
      apiKey: resolved.apiKey,
      token: resolved.token,
      profileId: resolved.profile.id,
      label: resolved.profile.label
    };
  });

  storage.init();
  recoverInterruptedWork();
  try {
    const retention = storage.getRetentionConfig();
    if (shouldRunRetentionCleanup(retention.lastPurgeAt)) {
      const auditLogsDeleted = storage.purgeOldAuditLogs(retention.auditLogDays);
      const taskRunsDeleted = storage.purgeOldTaskRuns(retention.taskRunDays);
      const chatThreadsDeleted = retention.chatDays === null ? 0 : storage.purgeOldChatThreads(retention.chatDays);

      let workItemsDeleted = 0;
      if (retention.workDays !== null) {
        workItemsDeleted = storage.purgeOldWorkItems(retention.workDays);
        if (workItemsDeleted > 0) {
          deleteArtifactsForMissingWorkItems();
        }
      }

      storage.saveRetentionConfig({ lastPurgeAt: new Date().toISOString() });
      logger.info('Retention cleanup completed', {
        area: 'storage',
        auditLogsDeleted,
        taskRunsDeleted,
        chatThreadsDeleted,
        workItemsDeleted
      });
    }
  } catch (error) {
    logger.warn('Retention cleanup failed; continuing app startup.', {
      area: 'storage',
      error: error instanceof Error ? error.message : String(error)
    });
  }
  await refreshStoredModels();
  syncStructuredExports();

  const storedMode = storage.getAgentMode();
  if (workspaceSecurity.isEncryptionEnabled()) {
    resolvedAgentModeForAuto = 'ollama';
  } else if (storedMode === 'auto') {
    try {
      const status = await runtime.getStatus();
      resolvedAgentModeForAuto = status.runtimeBridgeReady ? 'bridge' : 'ollama';
    } catch {
      resolvedAgentModeForAuto = 'ollama';
    }
  }
}

function startBackgroundServices() {
  if (heartbeatService) {
    return;
  }

  heartbeatService = new HeartbeatService();
  heartbeatService.registerChecklistItem({
    id: 'due-tasks',
    description: 'Process scheduled tasks that are overdue',
    handler: async () => {
      if (!workspaceReady) {
        return { acted: false };
      }
      const before = storage.listWorkItems().length;
      await processDueTasks();
      const after = storage.listWorkItems().length;
      const acted = after > before;
      return { acted, message: acted ? `Processed ${after - before} task(s)` : undefined };
    },
  });
  heartbeatService.registerChecklistItem({
    id: 'bridge-health',
    description: 'Verify runtime bridge gateway is reachable',
    handler: async () => {
      const status = await agentManager.getStatus();
      return { acted: false, message: status ? `Gateway OK — ${status.agents} agent(s)` : 'Gateway unreachable' };
    },
  });
  heartbeatService.start();

  schedulerHandle = setInterval(() => {
    if (!workspaceReady) {
      return;
    }
    void processDueTasks();
  }, 2000);
}

app.whenReady().then(async () => {
  logger.info('App starting', { version: app.getVersion(), platform: process.platform });
  const workspacePaths = getWorkspacePaths();
  runtime.setWorkspaceRoot(workspacePaths.root);
  workspaceSecurity = new WorkspaceEncryptionManager(app.getPath('userData'));
  await workspaceSecurity.load();
  if (!workspaceSecurity.getState().locked) {
    await initializeWorkspaceStorage();
  }

  ipcMain.handle(channels.securityGetState, async () => getWorkspaceSecurityState());
  ipcMain.handle(channels.securityUnlock, async (_event, password: string) => {
    if (!workspaceSecurity.isEncryptionEnabled()) {
      return getWorkspaceSecurityState();
    }

    await workspaceSecurity.unlock(password);
    if (!workspaceReady) {
      await initializeWorkspaceStorage();
    }
    syncRuntimeConfig();
    return getWorkspaceSecurityState();
  });
  ipcMain.handle(channels.securityEnable, async (_event, password: string) => {
    requirePermission('manage_settings');
    if (!password.trim()) {
      throw new Error('Raman AI password is required.');
    }

    await workspaceSecurity.enable(password);
    try {
      storage.rotateTextCipher(workspaceSecurity.getStorageCipher());
      rewriteWorkspaceArtifactFiles(true);
      syncStructuredExports();
      return getWorkspaceSecurityState();
    } catch (error) {
      await workspaceSecurity.disable(password).catch(() => undefined);
      throw error;
    }
  });
  ipcMain.handle(channels.securityDisable, async (_event, password: string) => {
    requirePermission('manage_settings');
    if (!workspaceSecurity.isEncryptionEnabled()) {
      return getWorkspaceSecurityState();
    }

    storage.rotateTextCipher(PLAIN_STORAGE_CIPHER);
    rewriteWorkspaceArtifactFiles(false);
    await workspaceSecurity.disable(password);
    syncStructuredExports();
    return getWorkspaceSecurityState();
  });

  ipcMain.handle(channels.profileGet, async () => storage.getProfile());
  ipcMain.handle(channels.profileSave, async (_event, profile: LocalProfile) => {
    requirePermission('manage_settings');
    const saved = storage.saveProfile(profile);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.workspaceSnapshot, async () => buildSnapshot({ lite: true }));
  ipcMain.handle(channels.workspaceListTasksPaginated, async (_event, limit: number, offset: number) => {
    return storage.listTasksPaginated(limit, offset);
  });
  ipcMain.handle(channels.workspaceListWorkItemsPaginated, async (_event, limit: number, offset: number) => {
    return storage.listWorkItemsPaginated(limit, offset);
  });
  ipcMain.handle(channels.workspaceListChatThreadsPaginated, async (_event, limit: number, offset: number) => {
    return storage.listChatThreadsPaginated(limit, offset);
  });
  ipcMain.handle(channels.workspaceBackupExport, async () => {
    requirePermission('manage_settings');
    syncStructuredExports();
    return createBackupExport(await buildLocalBundleContext(agentManager));
  });
  ipcMain.handle(channels.contextTreeSave, async (_event, tree: ContextTreeState) => {
    requirePermission('edit_context');
    storage.saveContextTree(tree);
    const factIdsInTree = collectAllFactIdsFromState(tree);
    const allFacts = storage.listMemoryFacts();
    const toDelete = allFacts.filter((f) => !factIdsInTree.has(f.id)).map((f) => f.id);
    if (toDelete.length > 0) {
      storage.deleteMemoryFactsByIds(toDelete);
    }
    syncStructuredExports();
    return storage.getContextTree();
  });
  ipcMain.handle(channels.contextTreeSync, async () => {
    const tree = upsertFactsIntoTree(storage.getContextTree(), storage.listMemoryFacts());
    storage.saveContextTree(tree);
    syncStructuredExports();
    return {
      tree,
      facts: storage.listMemoryFacts()
    };
  });
  ipcMain.handle(channels.groupUpsert, async (_event, group: unknown) => {
    requirePermission('create_agents');
    const parsed = group as GroupSpec;
    const payload = normalizeGroupAutoRouting({
      id: parsed.id || randomUUID(),
      name: parsed.name?.trim() || '',
      description: parsed.description?.trim() || '',
      memberAgentIds: Array.isArray(parsed.memberAgentIds) ? parsed.memberAgentIds : [],
      routingMode: parsed.routingMode ?? 'auto',
      autoRouteThreshold: parsed.autoRouteThreshold ?? DEFAULT_GROUP_ROUTING_LOW_CONFIDENCE_THRESHOLD,
      ...(parsed.defaultResponderAgentId ? { defaultResponderAgentId: parsed.defaultResponderAgentId } : {}),
      ...(parsed.autoRouting ? { autoRouting: parsed.autoRouting } : {})
    });

    if (!payload.name) {
      throw new Error('Group name is required.');
    }

    storage.upsertGroup(payload);
    syncStructuredExports();
    return payload;
  });
  ipcMain.handle(channels.groupDelete, async (_event, groupId: string) => {
    requirePermission('delete_groups');
    const threads = storage.listChatThreads().filter((thread) => thread.targetType === 'group' && thread.targetId === groupId);
    for (const thread of threads) {
      storage.deleteChatThread(thread.id);
    }
    storage.deleteGroup(groupId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.agentDelete, async (_event, agentId: string) => {
    requirePermission('create_agents');
    storage.deleteAgent(agentId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.assistantSend, async (_event, input: AssistantRequest) => {
    requirePermission('create_agents');
    syncRuntimeConfig();
    const reply = await withRuntimeBridgeCompatibility(() => runtime.sendAssistantRequest(input));
    if (reply.createdAgent) {
      storage.upsertAgent(reply.createdAgent);
      syncStructuredExports();
    }
    await extractAndPersistMemories('chat', `assistant:${reply.id}`, `${input.message}\n\n${reply.text}`);
    return reply;
  });
  ipcMain.handle(channels.agentChat, async (_event, input: AgentChatInput) => {
    requirePermission('run_tasks');
    return sendAgentChat(input);
  });
  ipcMain.handle(channels.agentChatStream, async (event, input: AgentChatInput) => {
    requirePermission('run_tasks');
    syncRuntimeConfig();
    const snapshot = storage.getWorkspaceSnapshot();
    const agent = snapshot.agents.find((candidate) => candidate.id === input.agentId);
    if (!agent) {
      throw new Error('Chatbot not found.');
    }

    const thread = findOrCreateThread('agent', agent.id, agent.name);
    const route = buildRouteMetadata({
      mode: 'direct',
      targetType: 'agent',
      targetIds: [agent.id],
      confidence: 1,
      reason: 'Direct agent chat'
    });
    const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You', route });
    const withUser = appendThreadMessages(thread, [userMessage]);

    const streamId = input.streamId?.trim() || randomUUID();
    const objective = buildAgentChatObjective(agent, withUser, input.message.trim());
    const webContents = event.sender;
    const taskContext = {
      contextTree: snapshot.contextTree,
      agents: snapshot.agents,
      groups: snapshot.groups
    };

    if (!webContents.isDestroyed()) {
      webContents.send(channels.chatStreamToken, {
        streamId,
        token: '',
        done: false,
        assistantLabel: agent.name
      });
    }

    try {
      const result = await withRuntimeBridgeCompatibility(() =>
        runtime.streamAgentChat(
          { agent, objective, contextTree: snapshot.contextTree, context: taskContext },
          (token) => {
            if (!webContents.isDestroyed()) {
              webContents.send(channels.chatStreamToken, { streamId, token, done: false });
            }
          }
        )
      );

      const assistantMessage = makeChatMessage({
        role: 'assistant',
        text: result.text,
        authorId: agent.id,
        authorLabel: agent.name,
        provider: result.provider,
        modelId: result.modelId,
        route
      });
      const nextThread = appendThreadMessages(withUser, [assistantMessage]);

      if (!webContents.isDestroyed()) {
        webContents.send(channels.chatStreamToken, { streamId, token: '', done: true });
      }

      void extractAndPersistMemories('chat', `agent:${agent.id}:${assistantMessage.id}`, `${input.message}\n\n${result.text}`);

      return {
        streamId,
        thread: nextThread,
        newMessages: [userMessage, assistantMessage]
      };
    } catch (error) {
      if (!webContents.isDestroyed()) {
        webContents.send(channels.chatStreamToken, {
          streamId,
          token: '',
          done: true,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  });
  ipcMain.handle(channels.groupChat, async (_event, input: GroupChatInput) => {
    requirePermission('run_tasks');
    return sendGroupChat(input);
  });
  ipcMain.handle(channels.groupChatStream, async (event, input: GroupChatInput) => {
    requirePermission('run_tasks');
    syncRuntimeConfig();
    const snapshot = storage.getWorkspaceSnapshot();
    const group = snapshot.groups.find((candidate) => candidate.id === input.groupId);
    if (!group) {
      throw new Error('Group not found.');
    }
    const routingGroup = normalizeGroupAutoRouting(group);

    const memberAgents = snapshot.agents.filter((agent) => routingGroup.memberAgentIds.includes(agent.id));
    const routingDecision = selectGroupRoutingDecision(routingGroup, memberAgents, input.message.trim());
    const thread = findOrCreateThread('group', routingGroup.id, routingGroup.name);
    const mentions = parseMentions(input.message);
    const userRoute = routingDecision
      ? buildRouteMetadata({
          mode: routingDecision.mode,
          targetType: 'group',
          targetIds: [routingDecision.agent.id],
          confidence: routingDecision.confidence,
          reason: routingDecision.mode === 'mention' ? 'Explicit @mention pin' : 'Auto-routed best fit',
          pinnedMentions: routingDecision.pinnedMentions
        })
      : undefined;
    const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You', mentions, ...(userRoute ? { route: userRoute } : {}) });
    const withUser = appendThreadMessages(thread, [userMessage]);

    const streamId = input.streamId?.trim() || randomUUID();
    const webContents = event.sender;
    const taskContext = {
      contextTree: snapshot.contextTree,
      agents: snapshot.agents,
      groups: snapshot.groups
    };

    if (!routingDecision) {
      const systemMessage = makeChatMessage({
        role: 'system',
        text: routingGroup.routingMode === 'manual'
          ? 'Manual routing is enabled for this group. Mention one member chatbot with @chatbot-name to route the message.'
          : 'No eligible member chatbots are configured for this group yet.',
        authorLabel: 'System'
      });
      const nextThread = appendThreadMessages(withUser, [systemMessage]);
      return {
        streamId,
        thread: nextThread,
        newMessages: [userMessage, systemMessage]
      };
    }

    const assistantRoute = buildRouteMetadata({
      mode: routingDecision.mode,
      targetType: 'group',
      targetIds: [routingDecision.agent.id],
      confidence: routingDecision.confidence,
      reason: routingDecision.mode === 'mention' ? 'Explicit @mention pin' : 'Auto-routed best fit',
      pinnedMentions: routingDecision.pinnedMentions
    });

    const assistantMessages: ChatMessage[] = [];
    let activeThread = withUser;

    if (routingDecision.hintMessage) {
      const systemMessage = makeChatMessage({
        role: 'system',
        text: routingDecision.hintMessage,
        authorLabel: 'System',
        route: buildRouteMetadata({
          mode: 'hint',
          targetType: 'group',
          targetIds: [routingDecision.agent.id],
          confidence: routingDecision.confidence,
          reason: 'Low-confidence auto route'
        })
      });
      activeThread = appendThreadMessages(activeThread, [systemMessage]);
    }

    if (!webContents.isDestroyed()) {
      webContents.send(channels.chatStreamToken, {
        streamId,
        token: '',
        done: false,
        assistantLabel: routingDecision.agent.name,
        routeMode: routingDecision.mode
      });
    }

    const groupObjective = [
      `You are replying as "${routingDecision.agent.name}" inside the group "${group.name}".`,
      formatThreadHistory(activeThread),
      `Latest group message:\n${input.message.trim()}`,
      'Reply only for your own role and perspective.'
    ].filter(Boolean).join('\n\n');

    try {
      const result = await withRuntimeBridgeCompatibility(() =>
        runtime.streamAgentChat(
          {
            agent: routingDecision.agent,
            objective: groupObjective,
            contextTree: snapshot.contextTree,
            context: taskContext
          },
          (token) => {
            if (!webContents.isDestroyed()) {
              webContents.send(channels.chatStreamToken, { streamId, token, done: false });
            }
          }
        )
      );

      const assistantMessage = makeChatMessage({
        role: 'assistant',
        text: result.text,
        authorId: routingDecision.agent.id,
        authorLabel: routingDecision.agent.name,
        provider: result.provider,
        modelId: result.modelId,
        route: assistantRoute
      });
      activeThread = appendThreadMessages(activeThread, [assistantMessage]);
      assistantMessages.push(assistantMessage);

      if (!webContents.isDestroyed()) {
        webContents.send(channels.chatStreamToken, { streamId, token: '', done: true });
      }

      void extractAndPersistMemories('chat', `group:${group.id}:${userMessage.id}`, input.message.trim());

      return {
        streamId,
        thread: activeThread,
        newMessages: [userMessage, ...assistantMessages]
      };
    } catch (error) {
      if (!webContents.isDestroyed()) {
        webContents.send(channels.chatStreamToken, {
          streamId,
          token: '',
          done: true,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  });
  ipcMain.handle(channels.threadDelete, async (_event, threadId: string) => {
    requirePermission('manage_settings');
    storage.deleteChatThread(threadId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.taskCreate, async (_event, input: TaskCreateInput) => {
    const profile = storage.getProfile();
    const timezone = profile?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const task = buildTaskSpec(input, {
      timezone,
      installedModelIds: storage.listModels().filter((model) => model.installed).map((model) => model.id)
    });
    storage.upsertTask(task);
    syncStructuredExports();
    return task;
  });
  ipcMain.handle(channels.taskDelete, async (_event, taskId: string) => {
    requirePermission('delete_tasks');
    storage.deleteTask(taskId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.taskDuplicate, async (_event, taskId: string) => {
    requirePermission('run_tasks');
    const original = storage.getTask(taskId);
    if (!original) {
      throw new Error('Task not found.');
    }
    const now = new Date();
    const createdAt = now.toISOString();
    const firstRun = computeNextRun(original.schedule, now);
    const duplicated: TaskSpec = {
      ...makeTaskBase(original),
      id: randomUUID(),
      title: `${original.title} Copy`,
      status: firstRun <= now ? 'queued' : 'scheduled',
      createdAt,
      updatedAt: createdAt,
      nextRunAt: firstRun.toISOString(),
      runCount: 0,
      artifactIds: []
    };
    storage.upsertTask(duplicated);
    syncStructuredExports();
    return duplicated;
  });
  ipcMain.handle(channels.taskRerun, async (_event, taskId: string) => {
    requirePermission('run_tasks');
    const task = storage.getTask(taskId);
    if (!task) {
      throw new Error('Task not found.');
    }
    const nowIso = new Date().toISOString();

    // Cancel any in-flight claimed/running task runs so the scheduler can re-execute immediately.
    storage.cancelTaskRunsByTaskId(task.id, nowIso, 'Cancelled due to task rerun.');
    for (const item of storage.listWorkItems()) {
      if (item.status !== 'running') continue;
      if (item.sourceTaskId !== task.id) continue;
      storage.upsertWorkItem({
        ...item,
        status: 'cancelled',
        updatedAt: nowIso,
        lastError: 'Cancelled due to task rerun.'
      });
    }
    const rerun: TaskSpec = {
      ...makeTaskBase(task),
      status: 'queued',
      updatedAt: nowIso,
      nextRunAt: nowIso
    };
    storage.upsertTask(rerun);
    syncStructuredExports();
    return rerun;
  });
  ipcMain.handle(channels.workDelete, async (_event, workItemId: string) => {
    requirePermission('delete_tasks');
    deleteWorkItemArtifacts(workItemId);
    storage.deleteWorkItem(workItemId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.artifactOpen, async (_event, artifactId: string) => openArtifact(artifactId));
  ipcMain.handle(channels.providerAuthList, async () => {
    const profiles = await providerAuthStore.listProfiles();
    return profiles as ProviderAuthProfile[];
  });
  ipcMain.handle(channels.providerAuthUpsert, async (_event, input: ProviderAuthUpsertInput) => {
    requirePermission('manage_settings');
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }
    const id = input.id ?? `${input.provider}-${slugify(input.label)}`;
    const payload: Parameters<typeof providerAuthStore.upsertProfile>[0] = {
      id,
      provider: input.provider as Exclude<ProviderId, 'ollama'>,
      label: input.label
    };

    if (input.description !== undefined) payload.description = input.description;
    if (input.apiKey !== undefined) payload.apiKey = input.apiKey;
    if (input.token !== undefined) payload.token = input.token;
    if (input.isDefault !== undefined) payload.isDefault = input.isDefault;

    const profile = await providerAuthStore.upsertProfile(payload);
    if (input.isDefault === true) {
      storage.upsertProviderAuthSelection({ provider: input.provider, profileId: profile.id });
      syncStructuredExports();
    }
    return profile as ProviderAuthProfile;
  });
  ipcMain.handle(channels.providerAuthDelete, async (_event, input: ProviderAuthDeleteInput) => {
    requirePermission('manage_settings');
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }

    const selection = storage.getProviderAuthSelection(input.provider);
    if (selection?.profileId === input.profileId) {
      storage.upsertProviderAuthSelection({ provider: input.provider, profileId: null });
      await providerAuthStore.setProviderDefaultProfile(input.provider as Exclude<ProviderId, 'ollama'>, null);
      syncStructuredExports();
    }

    return providerAuthStore.deleteProfile(input.provider, input.profileId);
  });
  ipcMain.handle(channels.providerAuthTest, async (_event, input: ProviderAuthTestInput) => {
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }
    return providerAuthStore.testProfile({
      provider: input.provider,
      profileId: input.profileId,
      ...(input.probeWithRuntime !== undefined ? { probeWithRuntime: input.probeWithRuntime } : {})
    });
  });
  ipcMain.handle(channels.providerAuthGetSelection, async (_event, provider: ProviderId) => {
    return storage.getProviderAuthSelection(provider) as ProviderAuthSelection | null;
  });
  ipcMain.handle(channels.providerAuthSetSelection, async (_event, selection: ProviderAuthSelection) => {
    requirePermission('manage_settings');
    const saved = storage.upsertProviderAuthSelection(selection);
    await providerAuthStore.setProviderDefaultProfile(selection.provider as Exclude<ProviderId, 'ollama'>, selection.profileId);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.assistantOverrideGet, async () => {
    return storage.getAssistantProviderOverride() as AssistantProviderOverrideSettings | null;
  });
  ipcMain.handle(channels.retentionConfigGet, async () => requireWorkspaceReady().getRetentionConfig());
  ipcMain.handle(channels.retentionConfigSave, async (_event, config: RetentionConfigInput) => {
    requirePermission('manage_settings');
    return requireWorkspaceReady().saveRetentionConfig(config);
  });
  ipcMain.handle(channels.assistantOverrideSave, async (_event, override: AssistantProviderOverrideSettings | null) => {
    requirePermission('manage_settings');
    const saved = storage.saveAssistantProviderOverride(override);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.agentModeGet, async () => storage.getAgentMode());
  ipcMain.handle(channels.agentModeSave, async (_event, mode: AgentMode) => {
    requirePermission('manage_settings');
    return storage.saveAgentMode(mode);
  });
  ipcMain.handle(channels.ollamaStatus, async () => getOllamaRuntimeStatus());
  ipcMain.handle(channels.ollamaInstallDefaults, async () => {
    await ensureDefaultOllamaModelsInstalled();
    return getOllamaRuntimeStatus();
  });
  ipcMain.handle(channels.checkForUpdates, async () => checkForAppUpdates());
  ipcMain.handle(channels.supportBundleCreate, async () => {
    requirePermission('create_support_bundle');
    syncStructuredExports();
    return createSupportBundle(await buildLocalBundleContext(agentManager));
  });
  ipcMain.handle(channels.auditLogExport, async (_event, format: 'json' | 'csv') => {
    requirePermission('export_audit');
    return storage.exportAuditLog(format, 5000);
  });

  ipcMain.handle(channels.healthGet, async () => getHealthStatus(agentManager));
  ipcMain.handle(channels.bridgeAgentsList, async () => agentManager.listAgents());
  ipcMain.handle(channels.bridgeAgentSend, async (_event, agentId: string, message: string) => agentManager.sendMessage(agentId, message));
  ipcMain.handle(channels.bridgeSessions, async (_event, agentId?: string) => agentManager.getSessions(agentId));
  ipcMain.handle(channels.bridgeStatus, async () => agentManager.getStatus());
  ipcMain.handle(channels.bridgeGatewayRestart, async () => agentManager.restartGateway());
  ipcMain.handle(channels.bridgeChannelsList, async () => agentManager.listChannels());
  ipcMain.handle(channels.bridgeChannelAdd, async (_event, channel: string, token: string) => agentManager.addChannel(channel, token));
  ipcMain.handle(channels.bridgeChannelRemove, async (_event, channel: string) => agentManager.removeChannel(channel));
  ipcMain.handle(channels.bridgeChannelStatus, async () => agentManager.getChannelStatus());

  // Voice
  ipcMain.handle(channels.voiceGetConfig, async () => storage.getVoiceConfig());
  ipcMain.handle(channels.voiceSetConfig, async (_event, config: VoiceConfig) => {
    requirePermission('manage_settings');
    return storage.saveVoiceConfig(config);
  });
  ipcMain.handle(channels.voiceStart, async (_event, text: string, agentId?: string) => {
    syncRuntimeConfig();
    const snapshot = storage.getWorkspaceSnapshot();
    const targetAgentId = agentId ?? snapshot.agents[0]?.id ?? 'voice';
    const task = buildEphemeralTask({
      target: { type: 'agent', agentId: targetAgentId },
      objective: text,
    });
    const result = await withRuntimeBridgeCompatibility(() =>
      runtime.executeTask(task, {
        contextTree: snapshot.contextTree,
        agents: snapshot.agents,
        groups: snapshot.groups,
      }),
    );
    const event: VoiceEvent = {
      type: 'response',
      text: result.text,
      timestamp: Date.now(),
      agentId,
    };
    return event;
  });
  ipcMain.handle(channels.voiceStop, async () => ({ ok: true }));

  startBackgroundServices();

  await createWindow();
  setupAutoUpdater();
  setupTray(() => mainWindow);
  void checkForAppUpdates();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
  }
  heartbeatService?.stop();
  destroyTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
