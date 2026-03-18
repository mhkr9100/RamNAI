import { Notification, app, BrowserWindow, ipcMain, shell } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { channels } from './preload-api.js';
import type {
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
  PrismRequest,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderAuthSelection,
  ProviderId,
  TaskSpec,
  TaskRunRecord,
  UserMapNode,
  UserMapState,
  WorkItem
} from '@supreme/shared';
import { SqliteStorage } from '@supreme/storage';
import { LocalRuntimeAdapter, RuntimeWorkspaceManager, ProviderAuthStore } from '@supreme/runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const runtime = new LocalRuntimeAdapter();
const runtimeWorkspace = new RuntimeWorkspaceManager();
const providerAuthStore = new ProviderAuthStore();
let mainWindow: BrowserWindow | null = null;
let storage: SqliteStorage;
let schedulerHandle: NodeJS.Timeout | null = null;
let processingDueTasks = false;
const ollamaModelState = new Map<string, OllamaModelRuntimeState>();
const DEFAULT_GROUP_ROUTING_LOW_CONFIDENCE_THRESHOLD = 0.55;
const USER_MAP_VISIBILITY_ORDER: Array<'public' | 'private'> = ['public', 'private'];

interface GroupRoutingDecision {
  agent: AgentSpec;
  mode: 'mention' | 'auto';
  confidence: number;
  pinnedMentions: string[];
  hintMessage?: string;
}

interface WorkspacePaths {
  root: string;
  artifacts: string;
  context: string;
  agents: string;
  tasks: string;
  work: string;
  logs: string;
}

interface TaskCreateInput {
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

interface AgentChatInput {
  agentId: string;
  message: string;
}

interface GroupChatInput {
  groupId: string;
  message: string;
}

interface ProviderAuthUpsertInput {
  id: string;
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

function cloneUserMapNode(node: UserMapNode, inheritedVisibility?: 'public' | 'private'): UserMapNode {
  const visibility = node.visibility ?? inheritedVisibility;
  return {
    ...node,
    ...(visibility ? { visibility } : {}),
    children: node.children.map((child) => cloneUserMapNode(child, visibility))
  };
}

function normalizeUserMapTree(tree: UserMapNode, visibility: 'public' | 'private'): UserMapNode {
  return cloneUserMapNode(tree, visibility);
}

function normalizeUserMapState(state: UserMapState): UserMapState {
  return {
    publicTree: normalizeUserMapTree(state.publicTree, 'public'),
    privateTree: normalizeUserMapTree(state.privateTree, 'private')
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

  const root = path.join(app.getPath('userData'), 'workspace');
  const paths: WorkspacePaths = {
    root,
    artifacts: path.join(root, 'artifacts'),
    context: path.join(root, 'context'),
    agents: path.join(root, 'agents'),
    tasks: path.join(root, 'tasks'),
    work: path.join(root, 'work'),
    logs: path.join(root, 'logs')
  };

  Object.values(paths).forEach((directory) => mkdirSync(directory, { recursive: true }));
  cachedWorkspacePaths = paths;
  return paths;
}

function getDatabasePath() {
  return path.join(getWorkspacePaths().root, 'supreme-raman-ai.sqlite');
}

async function refreshStoredModels() {
  const models = await runtime.listModels();
  for (const model of models) {
    storage.updateModel(model);
  }
  return models;
}

async function getOllamaRuntimeStatus(): Promise<OllamaRuntimeStatus> {
  const models = await runtime.listModels();
  const status = await runtime.getStatus();
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
    models: entries
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

async function buildSnapshot() {
  const snapshot = storage.getWorkspaceSnapshot();
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
    userMap: snapshot.userMap,
    publicUserMap: snapshot.publicUserMap,
    privateUserMap: snapshot.privateUserMap,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts,
    models,
    runtime: runtimeStatus
  };
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function syncStructuredExports() {
  const paths = getWorkspacePaths();
  const snapshot = storage.getWorkspaceSnapshot();

  writeJsonFile(path.join(paths.context, 'profile.json'), snapshot.profile);
  writeJsonFile(path.join(paths.context, 'usermap-tree.json'), snapshot.userMap);
  writeJsonFile(path.join(paths.context, 'usermap-public-tree.json'), snapshot.publicUserMap);
  writeJsonFile(path.join(paths.context, 'usermap-private-tree.json'), snapshot.privateUserMap);
  writeJsonFile(path.join(paths.context, 'memory-facts.json'), snapshot.memoryFacts);
  writeJsonFile(path.join(paths.context, 'memory-public-facts.json'), snapshot.publicMemoryFacts);
  writeJsonFile(path.join(paths.context, 'memory-private-facts.json'), snapshot.privateMemoryFacts);
  writeJsonFile(path.join(paths.context, 'models.json'), snapshot.models);
  writeJsonFile(path.join(paths.agents, 'index.json'), snapshot.agents);
  writeJsonFile(path.join(paths.work, 'chat-threads.json'), snapshot.chatThreads);
  writeJsonFile(path.join(paths.tasks, 'index.json'), snapshot.tasks);
  writeJsonFile(path.join(paths.tasks, 'task-runs.json'), snapshot.taskRuns);
  writeJsonFile(path.join(paths.work, 'work-items.json'), snapshot.workItems);
  writeJsonFile(path.join(paths.work, 'artifacts.json'), snapshot.artifacts);

  for (const agent of snapshot.agents) {
    writeJsonFile(path.join(paths.agents, `${agent.slug}.json`), agent);
  }

  for (const task of snapshot.tasks) {
    writeJsonFile(path.join(paths.tasks, `${task.id}.json`), task);
  }

  void runtimeWorkspace.sync(paths.root, {
    profile: snapshot.profile,
    userMap: snapshot.userMap,
    agents: snapshot.agents,
    groups: snapshot.groups,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts
  }).catch((error) => {
    console.warn('[runtime-workspace] sync failed:', error);
  });
}

function upsertFactsIntoTree(tree: UserMapState, facts: MemoryFact[]): UserMapState {
  const nextTree = normalizeUserMapState(tree);
  const categoryRoots = {
    public: new Map<string, UserMapNode>(),
    private: new Map<string, UserMapNode>()
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
  if (newFacts.length === 0) return storage.getUserMap();
  const normalizedFacts = newFacts.map((fact) => ({
    ...fact,
    visibility: fact.visibility ?? 'public'
  }));
  storage.upsertMemoryFacts(normalizedFacts);
  const nextTree = upsertFactsIntoTree(storage.getUserMap(), storage.listMemoryFacts());
  storage.saveUserMap(nextTree);
  syncStructuredExports();
  return nextTree;
}

async function extractAndPersistMemories(source: MemoryFact['source'], sourceRef: string, text: string) {
  try {
    const facts = await runtime.extractMemoryFacts(source, sourceRef, text, storage.listMemoryFacts());
    await mergeAndPersistMemoryFacts(facts);
  } catch (error) {
    console.warn('[runtime] memory extraction skipped:', error);
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
  return {
    id: randomUUID(),
    taskId: task.id,
    taskTitle: task.title,
    taskObjective: task.objective,
    taskMode: task.mode,
    status: 'running',
    runIndex,
    target: task.target,
    createdAt: startedAt,
    updatedAt: startedAt,
    startedAt,
    artifactIds: []
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
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.error ? { error: input.error } : {}),
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
  const result = await runtime.executeTask(buildEphemeralTask({
    target: { type: 'agent', agentId: agent.id },
    objective: buildAgentChatObjective(agent, withUser, input.message.trim())
  }), {
    userMap: snapshot.userMap,
    agents: snapshot.agents,
    groups: snapshot.groups
  });

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

  const result = await runtime.executeTask(buildEphemeralTask({
      target: { type: 'agent', agentId: routingDecision.agent.id },
      objective: [
        `You are replying as "${routingDecision.agent.name}" inside the group "${group.name}".`,
        formatThreadHistory(activeThread),
        `Latest group message:\n${input.message.trim()}`,
        'Reply only for your own role and perspective.'
      ].filter(Boolean).join('\n\n')
    }), {
      userMap: snapshot.userMap,
      agents: snapshot.agents,
      groups: snapshot.groups
    });

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

function parseHourMinute(value: string) {
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value "${value}".`);
  }
  return { hour, minute };
}

function getZonedParts(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false
  });

  const parts = formatter.formatToParts(value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.get('year'));
  const month = Number(lookup.get('month'));
  const day = Number(lookup.get('day'));
  const hour = Number(lookup.get('hour'));
  const minute = Number(lookup.get('minute'));
  const weekdayRaw = lookup.get('weekday') ?? '';
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(weekdayRaw.toLowerCase().slice(0, 3));

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    weekday < 0
  ) {
    throw new Error(`Could not resolve zoned date parts for timezone "${timeZone}".`);
  }

  return { year, month, day, hour, minute, weekday };
}

function zonedDateTimeToUtc(input: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): Date {
  const initialGuessUtcMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0);
  let guess = new Date(initialGuessUtcMs);

  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(guess, timeZone);
    const deltaMinutes =
      (input.year - parts.year) * 525600 +
      (input.month - parts.month) * 43200 +
      (input.day - parts.day) * 1440 +
      (input.hour - parts.hour) * 60 +
      (input.minute - parts.minute);

    if (deltaMinutes === 0) {
      return guess;
    }
    guess = new Date(guess.getTime() + deltaMinutes * 60000);
  }

  return guess;
}

function parseRunAt(runAt: string, timeZone: string): Date {
  const parsed = new Date(runAt);
  if (!Number.isNaN(parsed.getTime()) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(runAt.trim())) {
    return parsed;
  }

  const match = runAt.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) {
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid runAt value "${runAt}".`);
    }
    return parsed;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match;
  return zonedDateTimeToUtc({
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: Number(hourRaw),
    minute: Number(minuteRaw)
  }, timeZone);
}

function nextCronRun(expression: string, from: Date, timeZone: string): Date {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Cron schedule must use the standard 5-field format.');
  }

  const [
    minuteField = '*',
    hourField = '*',
    dayField = '*',
    monthField = '*',
    weekdayField = '*'
  ] = fields;
  const start = new Date(from);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  for (let i = 0; i < 525600; i += 1) {
    const candidate = new Date(start.getTime() + i * 60000);
    const zoned = getZonedParts(candidate, timeZone);
    if (
      matchesCronField(zoned.minute, minuteField, 0, 59) &&
      matchesCronField(zoned.hour, hourField, 0, 23) &&
      matchesCronField(zoned.day, dayField, 1, 31) &&
      matchesCronField(zoned.month, monthField, 1, 12) &&
      matchesCronField(zoned.weekday, weekdayField, 0, 6)
    ) {
      return candidate;
    }
  }

  throw new Error('Could not compute the next cron run within one year.');
}

function matchesCronField(value: number, field: string, min: number, max: number) {
  if (field === '*') return true;

  return field.split(',').some((part) => {
    if (part.includes('/')) {
      const [base = '*', stepRaw = '0'] = part.split('/');
      const step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) return false;
      if (base === '*') {
        return (value - min) % step === 0;
      }
      if (base.includes('-')) {
        const [rangeStartRaw = '', rangeEndRaw = ''] = base.split('-');
        const rangeStart = Number(rangeStartRaw);
        const rangeEnd = Number(rangeEndRaw);
        if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) return false;
        return value >= rangeStart && value <= rangeEnd && (value - rangeStart) % step === 0;
      }
      const baseValue = Number(base);
      return value === baseValue;
    }

    if (part.includes('-')) {
      const [rangeStartRaw = '', rangeEndRaw = ''] = part.split('-');
      const rangeStart = Number(rangeStartRaw);
      const rangeEnd = Number(rangeEndRaw);
      if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) return false;
      return value >= rangeStart && value <= rangeEnd;
    }

    const numeric = Number(part);
    return Number.isInteger(numeric) && numeric >= min && numeric <= max && value === numeric;
  });
}

function computeNextRun(schedule: TaskSpec['schedule'], from = new Date()) {
  if (schedule.kind === 'once') {
    return parseRunAt(schedule.runAt, schedule.timezone);
  }

  if (schedule.kind === 'cron') {
    return nextCronRun(schedule.expression, from, schedule.timezone);
  }

  const base = new Date(from);
  const baseZoned = getZonedParts(base, schedule.timezone);
  const { hour, minute } = parseHourMinute(schedule.time);
  let candidate = zonedDateTimeToUtc({
    year: baseZoned.year,
    month: baseZoned.month,
    day: baseZoned.day,
    hour,
    minute
  }, schedule.timezone);

  if (schedule.preset === 'daily') {
    if (candidate <= base) {
      const nextDay = getZonedParts(new Date(base.getTime() + 24 * 60 * 60000), schedule.timezone);
      candidate = zonedDateTimeToUtc({
        year: nextDay.year,
        month: nextDay.month,
        day: nextDay.day,
        hour,
        minute
      }, schedule.timezone);
    }
    return candidate;
  }

  if (schedule.preset === 'weekly') {
    if (candidate <= base) {
      const nextWeek = new Date(base.getTime() + 7 * 24 * 60 * 60000);
      const nextWeekZoned = getZonedParts(nextWeek, schedule.timezone);
      candidate = zonedDateTimeToUtc({
        year: nextWeekZoned.year,
        month: nextWeekZoned.month,
        day: nextWeekZoned.day,
        hour,
        minute
      }, schedule.timezone);
    }
    return candidate;
  }

  if (candidate <= base) {
    const nextMonthUtcGuess = zonedDateTimeToUtc({
      year: baseZoned.year,
      month: baseZoned.month + 1,
      day: baseZoned.day,
      hour,
      minute
    }, schedule.timezone);
    return nextMonthUtcGuess;
  }

  return candidate;
}

function isRecurring(schedule: TaskSpec['schedule']) {
  return schedule.kind !== 'once';
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

function buildTaskSpec(input: TaskCreateInput): TaskSpec {
  const now = new Date();
  const createdAt = now.toISOString();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const schedule: TaskSpec['schedule'] =
    input.schedule.kind === 'once'
      ? {
          kind: 'once',
          runAt: parseRunAt(input.schedule.runAtLocal ?? now.toISOString(), timezone).toISOString(),
          timezone
        }
      : input.schedule.kind === 'simple'
        ? {
            kind: 'simple',
            preset: input.schedule.preset ?? 'daily',
            time: input.schedule.time ?? '09:00',
            timezone
          }
        : {
            kind: 'cron',
            expression: (input.schedule.expression ?? '0 9 * * 1-5').trim(),
            timezone
          };

  const outputPolicy: TaskSpec['outputPolicy'] = {
    saveResult: true,
    artifactMode: input.output?.artifactMode ?? 'markdown',
    notificationMode: input.output?.notificationMode ?? 'desktop',
    defaultSendToChat: Boolean(input.output?.defaultSendToChat ?? false)
  };

  const installedModelIds = storage.listModels().filter((model) => model.installed).map((model) => model.id);
  const modelOverrideId = input.modelOverrideId?.trim();
  const providerOverride = modelOverrideId ? { provider: 'ollama' as const, modelId: modelOverrideId } : undefined;

  const council = input.mode === 'council'
    ? (() => {
        const workers = (input.council?.workerModelIds ?? []).filter(Boolean);
        const resolvedWorkers = workers.length ? workers : installedModelIds.slice(0, 2);
        const judge = (input.council?.judgeModelId ?? '').trim() || resolvedWorkers[0] || installedModelIds[0] || '';
        if (resolvedWorkers.length === 0 || !judge) {
          throw new Error('No installed local models available for council mode.');
        }
        return {
          workerModels: resolvedWorkers.map((modelId) => ({ provider: 'ollama' as const, modelId })),
          judgeModel: { provider: 'ollama' as const, modelId: judge }
        } satisfies TaskSpec['council'];
      })()
    : undefined;

  const firstRun = computeNextRun(schedule, now);
  return {
    id: randomUUID(),
    title: input.title.trim(),
    objective: input.objective.trim(),
    mode: input.mode,
    target: input.target,
    schedule,
    outputPolicy,
    status: firstRun <= now ? 'queued' : 'scheduled',
    createdAt,
    updatedAt: createdAt,
    nextRunAt: firstRun.toISOString(),
    runCount: 0,
    artifactIds: [],
    ...(providerOverride ? { providerOverride } : {}),
    ...(council ? { council } : {})
  };
}

function createArtifactRecords(task: TaskSpec, workItemId: string, result: { text: string; councilTrace?: Array<{ modelId: string; stage: string; output: string }> }, mode: ArtifactMode) {
  const paths = getWorkspacePaths();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(paths.artifacts, task.id, stamp);
  mkdirSync(runDir, { recursive: true });

  const artifacts: ArtifactRecord[] = [];

  if (mode === 'markdown' || mode === 'both') {
    const relativePath = path.relative(paths.root, path.join(runDir, 'result.md'));
    writeFileSync(path.join(runDir, 'result.md'), `${result.text}\n`, 'utf8');
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
    });
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
  const taskRun = buildTaskRunRecord(task, task.runCount + 1, startedAt);
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

  storage.upsertTask(runningTask);
  storage.upsertTaskRun(taskRun);
  storage.upsertWorkItem(runningWorkItem);
  syncStructuredExports();

  try {
    const snapshot = storage.getWorkspaceSnapshot();
    const result = await runtime.executeTask(task, {
      userMap: snapshot.userMap,
      agents: snapshot.agents,
      groups: snapshot.groups
    });
    const artifacts = createArtifactRecords(task, workItemId, result, task.outputPolicy.artifactMode);
    const completedAt = new Date().toISOString();
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
    storage.upsertTaskRun(completeTaskRun(taskRun, {
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
    storage.upsertTaskRun(completeTaskRun(taskRun, {
      status: 'failed',
      completedAt,
      error: message
    }));
    storage.upsertWorkItem(failedWorkItem);
    syncStructuredExports();
    maybeNotify({ ...failedTask, status: 'failed' }, message);
  }
}

async function processDueTasks() {
  if (processingDueTasks) return;
  processingDueTasks = true;

  try {
    const now = Date.now();
    const dueTasks = storage
      .listTasks()
      .filter((task) => ['scheduled', 'queued'].includes(task.status) && task.nextRunAt && Date.parse(task.nextRunAt) <= now)
      .sort((left, right) => Date.parse(left.nextRunAt ?? left.createdAt) - Date.parse(right.nextRunAt ?? right.createdAt));

    for (const task of dueTasks) {
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

async function openArtifact(artifactId: string) {
  const artifact = storage.getArtifact(artifactId);
  if (!artifact) {
    throw new Error('Artifact not found.');
  }

  const paths = getWorkspacePaths();
  const targetPath = path.join(paths.root, artifact.relativePath);
  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }

  return { ok: true as const };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#08090a',
    title: 'Supreme Raman AI',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.SUPREME_RENDERER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function recoverInterruptedWork() {
  const now = new Date();
  const nowIso = now.toISOString();
  const tasks = storage.listTasks();
  const workItems = storage.listWorkItems();

  for (const task of tasks) {
    if (task.status !== 'running') continue;

    const recurring = isRecurring(task.schedule);
    const nextRunAt = recurring ? computeNextRun(task.schedule, now).toISOString() : task.nextRunAt;
    const runRecord = storage.listTaskRuns(task.id).find((run) => run.status === 'running')
      ?? buildTaskRunRecord(task, task.runCount + 1, task.startedAt ?? nowIso);
    const recovered: TaskSpec = {
      ...makeTaskBase(task),
      status: recurring ? 'scheduled' : 'failed',
      updatedAt: nowIso,
      completedAt: nowIso,
      lastRunAt: nowIso,
      runCount: task.runCount + 1,
      lastError: 'Recovered after app restart during an in-progress run.',
      artifactIds: [],
      ...(nextRunAt ? { nextRunAt } : {})
    };

    storage.upsertTask(recovered);
    storage.upsertTaskRun(completeTaskRun(runRecord, {
      status: 'failed',
      completedAt: nowIso,
      error: 'Recovered after app restart during an in-progress run.'
    }));
  }

  for (const item of workItems) {
    if (item.status !== 'running') continue;
    const recovered: WorkItem = {
      ...item,
      status: 'failed',
      updatedAt: nowIso,
      lastError: 'Recovered after app restart during an in-progress run.'
    };
    storage.upsertWorkItem(recovered);
  }
}

app.whenReady().then(async () => {
  const workspacePaths = getWorkspacePaths();
  runtime.setWorkspaceRoot(workspacePaths.root);

  storage = new SqliteStorage(path.join(workspacePaths.root, 'supreme-raman-ai.sqlite'));
  storage.init();
  recoverInterruptedWork();
  await refreshStoredModels();
  syncStructuredExports();

  ipcMain.handle(channels.profileGet, async () => storage.getProfile());
  ipcMain.handle(channels.profileSave, async (_event, profile: LocalProfile) => {
    const saved = storage.saveProfile(profile);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.workspaceSnapshot, async () => buildSnapshot());
  ipcMain.handle(channels.userMapSave, async (_event, tree: UserMapState) => {
    const saved = storage.saveUserMap(tree);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.userMapSync, async () => {
    const tree = upsertFactsIntoTree(storage.getUserMap(), storage.listMemoryFacts());
    storage.saveUserMap(tree);
    syncStructuredExports();
    return {
      tree,
      facts: storage.listMemoryFacts()
    };
  });
  ipcMain.handle(channels.groupUpsert, async (_event, group: unknown) => {
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
    const threads = storage.listChatThreads().filter((thread) => thread.targetType === 'group' && thread.targetId === groupId);
    for (const thread of threads) {
      storage.deleteChatThread(thread.id);
    }
    storage.deleteGroup(groupId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.prismSend, async (_event, input: PrismRequest) => {
    const reply = await runtime.sendPrismRequest(input);
    if (reply.createdAgent) {
      storage.upsertAgent(reply.createdAgent);
      syncStructuredExports();
    }
    await extractAndPersistMemories('chat', `prism:${reply.id}`, `${input.message}\n\n${reply.text}`);
    return reply;
  });
  ipcMain.handle(channels.agentChat, async (_event, input: AgentChatInput) => sendAgentChat(input));
  ipcMain.handle(channels.groupChat, async (_event, input: GroupChatInput) => sendGroupChat(input));
  ipcMain.handle(channels.threadDelete, async (_event, threadId: string) => {
    storage.deleteChatThread(threadId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.taskCreate, async (_event, input: TaskCreateInput) => {
    const task = buildTaskSpec(input);
    storage.upsertTask(task);
    syncStructuredExports();
    return task;
  });
  ipcMain.handle(channels.taskDelete, async (_event, taskId: string) => {
    storage.deleteTask(taskId);
    syncStructuredExports();
    return { ok: true };
  });
  ipcMain.handle(channels.taskDuplicate, async (_event, taskId: string) => {
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
    const task = storage.getTask(taskId);
    if (!task) {
      throw new Error('Task not found.');
    }
    const rerun: TaskSpec = {
      ...makeTaskBase(task),
      status: 'queued',
      updatedAt: new Date().toISOString(),
      nextRunAt: new Date().toISOString()
    };
    storage.upsertTask(rerun);
    syncStructuredExports();
    return rerun;
  });
  ipcMain.handle(channels.workDelete, async (_event, workItemId: string) => {
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
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }
    const payload: Parameters<typeof providerAuthStore.upsertProfile>[0] = {
      id: input.id,
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
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }

    const selection = storage.getProviderAuthSelection(input.provider);
    if (selection?.profileId === input.profileId) {
      storage.upsertProviderAuthSelection({ provider: input.provider, profileId: null });
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
    const saved = storage.upsertProviderAuthSelection(selection);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.prismOverrideGet, async () => {
    return storage.getPrismProviderOverride() as PrismProviderOverrideSettings | null;
  });
  ipcMain.handle(channels.prismOverrideSave, async (_event, override: PrismProviderOverrideSettings | null) => {
    const saved = storage.savePrismProviderOverride(override);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.ollamaStatus, async () => getOllamaRuntimeStatus());
  ipcMain.handle(channels.ollamaInstallDefaults, async () => {
    await ensureDefaultOllamaModelsInstalled();
    return getOllamaRuntimeStatus();
  });

  schedulerHandle = setInterval(() => {
    void processDueTasks();
  }, 2000);

  await createWindow();

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
