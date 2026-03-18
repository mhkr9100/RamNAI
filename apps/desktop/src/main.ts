import { Notification, app, BrowserWindow, ipcMain, shell } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
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
  ChatThread,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  OllamaRuntimeStatus,
  OllamaModelInstallStatus,
  PrismRequest,
  ProviderAuthProfile,
  ProviderId,
  TaskSpec,
  UserMapNode,
  WorkItem
} from '@supreme/shared';
import { SqliteStorage } from '@supreme/storage';
import { LocalRuntimeAdapter, OpenClawWorkspaceManager, OpenClawAuthManager } from '@supreme/runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const runtime = new LocalRuntimeAdapter();
const openClawWorkspace = new OpenClawWorkspaceManager();
const openClawAuth = new OpenClawAuthManager();
let mainWindow: BrowserWindow | null = null;
let storage: SqliteStorage;
let schedulerHandle: NodeJS.Timeout | null = null;
let processingDueTasks = false;
const ollamaModelState = new Map<string, OllamaModelRuntimeState>();

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
  providerOverride?: TaskSpec['providerOverride'];
  schedule: TaskSpec['schedule'];
  outputPolicy: TaskSpec['outputPolicy'];
  council?: TaskSpec['council'];
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

interface OllamaModelRuntimeState {
  status: OllamaModelInstallStatus;
  lastError?: string;
}

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
      ...(state?.lastError ? { lastError: state.lastError } : {})
    };
  });

  return {
    running: status.ollamaReady,
    models: entries
  };
}

async function ensureDefaultOllamaModelsInstalled() {
  const status = await runtime.getStatus();
  if (!status.ollamaReady) {
    throw new Error('Ollama runtime is not reachable. Start Ollama before installing models.');
  }

  const models = await runtime.listModels();
  for (const preset of models.filter((model) => model.recommended)) {
    if (preset.installed) {
      ollamaModelState.set(preset.id, { status: 'installed' });
      continue;
    }

    ollamaModelState.set(preset.id, { status: 'installing' });
    try {
      // Use the Ollama CLI to pull the model so the local runtime can discover it.
      await execFileAsync('ollama', ['pull', preset.id]);
      ollamaModelState.set(preset.id, { status: 'installed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ollamaModelState.set(preset.id, { status: 'error', lastError: message });
    }
  }
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
    workItems: snapshot.workItems,
    artifacts: snapshot.artifacts,
    userMap: snapshot.userMap,
    memoryFacts: snapshot.memoryFacts,
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
  writeJsonFile(path.join(paths.context, 'memory-facts.json'), snapshot.memoryFacts);
  writeJsonFile(path.join(paths.context, 'models.json'), snapshot.models);
  writeJsonFile(path.join(paths.agents, 'index.json'), snapshot.agents);
  writeJsonFile(path.join(paths.work, 'chat-threads.json'), snapshot.chatThreads);
  writeJsonFile(path.join(paths.tasks, 'index.json'), snapshot.tasks);
  writeJsonFile(path.join(paths.work, 'work-items.json'), snapshot.workItems);
  writeJsonFile(path.join(paths.work, 'artifacts.json'), snapshot.artifacts);

  for (const agent of snapshot.agents) {
    writeJsonFile(path.join(paths.agents, `${agent.slug}.json`), agent);
  }

  for (const task of snapshot.tasks) {
    writeJsonFile(path.join(paths.tasks, `${task.id}.json`), task);
  }

  void openClawWorkspace.sync(paths.root, {
    profile: snapshot.profile,
    userMap: snapshot.userMap,
    agents: snapshot.agents,
    groups: snapshot.groups,
    memoryFacts: snapshot.memoryFacts
  }).catch((error) => {
    console.warn('[openclaw-workspace] sync failed:', error);
  });
}

function upsertFactsIntoTree(tree: UserMapNode, facts: MemoryFact[]): UserMapNode {
  const nextTree = structuredClone(tree);
  const categories = new Map(nextTree.children.map((child) => [child.label, child]));

  for (const fact of facts) {
    let categoryNode = categories.get(fact.category);
    if (!categoryNode) {
      categoryNode = {
        id: `category-${slugify(fact.category)}`,
        label: fact.category,
        nodeType: 'category',
        children: [],
        source: 'manual'
      };
      nextTree.children.push(categoryNode);
      categories.set(fact.category, categoryNode);
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
      continue;
    }

    categoryNode.children.push({
      id: fact.id,
      label: fact.label,
      value: fact.value,
      nodeType: 'fact',
      confidence: fact.confidence,
      source: 'memory',
      children: []
    });
  }

  nextTree.children.sort((left, right) => left.label.localeCompare(right.label));
  for (const category of nextTree.children) {
    category.children.sort((left, right) => left.label.localeCompare(right.label));
  }

  return nextTree;
}

async function mergeAndPersistMemoryFacts(newFacts: MemoryFact[]) {
  if (newFacts.length === 0) return storage.getUserMap();
  storage.upsertMemoryFacts(newFacts);
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

function resolveMentionedAgents(message: string, memberAgents: AgentSpec[]) {
  const mentions = parseMentions(message).map((mention) => mention.toLowerCase());
  if (mentions.length === 0) {
    return [] as AgentSpec[];
  }

  return memberAgents.filter((agent) => {
    const slug = slugify(agent.name);
    const compact = agent.name.toLowerCase().replace(/\s+/g, '');
    return mentions.includes(slug) || mentions.includes(compact);
  });
}

async function sendAgentChat(input: AgentChatInput) {
  const snapshot = storage.getWorkspaceSnapshot();
  const agent = snapshot.agents.find((candidate) => candidate.id === input.agentId);
  if (!agent) {
    throw new Error('Chatbot not found.');
  }

  const thread = findOrCreateThread('agent', agent.id, agent.name);
  const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You' });
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
    modelId: result.modelId
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

  const memberAgents = snapshot.agents.filter((agent) => group.memberAgentIds.includes(agent.id));
  const mentionedAgents = resolveMentionedAgents(input.message, memberAgents);
  const thread = findOrCreateThread('group', group.id, group.name);
  const mentions = parseMentions(input.message);
  const userMessage = makeChatMessage({ role: 'user', text: input.message.trim(), authorLabel: 'You', mentions });
  const withUser = appendThreadMessages(thread, [userMessage]);

  if (mentionedAgents.length === 0) {
    const systemMessage = makeChatMessage({
      role: 'system',
      text: 'Manual routing is enabled for groups. Mention one or more member chatbots using @chatbot-name to get replies.',
      authorLabel: 'System'
    });
    const nextThread = appendThreadMessages(withUser, [systemMessage]);
    return {
      thread: nextThread,
      newMessages: [userMessage, systemMessage]
    };
  }

  const assistantMessages: ChatMessage[] = [];
  let activeThread = withUser;

  for (const agent of mentionedAgents) {
    const result = await runtime.executeTask(buildEphemeralTask({
      target: { type: 'agent', agentId: agent.id },
      objective: [
        `You are replying as "${agent.name}" inside the group "${group.name}".`,
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
      authorId: agent.id,
      authorLabel: agent.name,
      provider: result.provider,
      modelId: result.modelId
    });
    activeThread = appendThreadMessages(activeThread, [assistantMessage]);
    assistantMessages.push(assistantMessage);
  }

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

function nextCronRun(expression: string, from: Date): Date {
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
    if (
      matchesCronField(candidate.getMinutes(), minuteField, 0, 59) &&
      matchesCronField(candidate.getHours(), hourField, 0, 23) &&
      matchesCronField(candidate.getDate(), dayField, 1, 31) &&
      matchesCronField(candidate.getMonth() + 1, monthField, 1, 12) &&
      matchesCronField(candidate.getDay(), weekdayField, 0, 6)
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
    return new Date(schedule.runAt);
  }

  if (schedule.kind === 'cron') {
    return nextCronRun(schedule.expression, from);
  }

  const base = new Date(from);
  const { hour, minute } = parseHourMinute(schedule.time);
  const candidate = new Date(base);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);

  if (schedule.preset === 'daily') {
    if (candidate <= base) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  if (schedule.preset === 'weekly') {
    if (candidate <= base) candidate.setDate(candidate.getDate() + 7);
    return candidate;
  }

  const next = new Date(candidate);
  if (next <= base) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
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
  const firstRun = computeNextRun(input.schedule, now);
  return {
    id: randomUUID(),
    title: input.title.trim(),
    objective: input.objective.trim(),
    mode: input.mode,
    target: input.target,
    schedule: input.schedule,
    outputPolicy: input.outputPolicy,
    status: firstRun <= now ? 'queued' : 'scheduled',
    createdAt,
    updatedAt: createdAt,
    nextRunAt: firstRun.toISOString(),
    runCount: 0,
    artifactIds: [],
    ...(input.providerOverride ? { providerOverride: input.providerOverride } : {}),
    ...(input.council ? { council: input.council } : {})
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

app.whenReady().then(async () => {
  const workspacePaths = getWorkspacePaths();
  runtime.setWorkspaceRoot(workspacePaths.root);

  storage = new SqliteStorage(path.join(workspacePaths.root, 'supreme-raman-ai.sqlite'));
  storage.init();
  await refreshStoredModels();
  syncStructuredExports();

  ipcMain.handle(channels.profileGet, async () => storage.getProfile());
  ipcMain.handle(channels.profileSave, async (_event, profile: LocalProfile) => {
    const saved = storage.saveProfile(profile);
    syncStructuredExports();
    return saved;
  });
  ipcMain.handle(channels.workspaceSnapshot, async () => buildSnapshot());
  ipcMain.handle(channels.userMapSave, async (_event, tree: UserMapNode) => {
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
    const payload: GroupSpec = {
      id: parsed.id || randomUUID(),
      name: parsed.name?.trim(),
      description: parsed.description?.trim() || '',
      memberAgentIds: Array.isArray(parsed.memberAgentIds) ? parsed.memberAgentIds : []
    };

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
    const duplicated = buildTaskSpec({
      title: `${original.title} Copy`,
      objective: original.objective,
      mode: original.mode,
      target: original.target,
      schedule: original.schedule,
      outputPolicy: original.outputPolicy,
      ...(original.providerOverride ? { providerOverride: original.providerOverride } : {}),
      ...(original.council ? { council: original.council } : {})
    });
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
    const profiles = await openClawAuth.listProfiles();
    return profiles as ProviderAuthProfile[];
  });
  ipcMain.handle(channels.providerAuthUpsert, async (_event, input: ProviderAuthUpsertInput) => {
    if (input.provider === 'ollama') {
      throw new Error('Auth profiles are only supported for remote providers.');
    }
    const payload: Parameters<typeof openClawAuth.upsertProfile>[0] = {
      id: input.id,
      provider: input.provider as Exclude<ProviderId, 'ollama'>,
      label: input.label
    };

    if (input.description !== undefined) payload.description = input.description;
    if (input.apiKey !== undefined) payload.apiKey = input.apiKey;
    if (input.token !== undefined) payload.token = input.token;
    if (input.isDefault !== undefined) payload.isDefault = input.isDefault;

    const profile = await openClawAuth.upsertProfile(payload);
    return profile as ProviderAuthProfile;
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
