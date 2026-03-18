import { Notification, app, BrowserWindow, ipcMain, shell } from 'electron';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { channels } from './preload-api.js';
import type {
  AgentSpec,
  ArtifactMode,
  ArtifactRecord,
  LocalProfile,
  MemoryFact,
  PrismRequest,
  TaskSpec,
  UserMapNode,
  WorkItem
} from '@supreme/shared';
import { SqliteStorage } from '@supreme/storage';
import { LocalRuntimeAdapter } from '@supreme/runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtime = new LocalRuntimeAdapter();
let mainWindow: BrowserWindow | null = null;
let storage: SqliteStorage;
let schedulerHandle: NodeJS.Timeout | null = null;
let processingDueTasks = false;

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

function getWorkspacePaths(): WorkspacePaths {
  const root = path.join(app.getPath('userData'), 'workspace');
  const paths = {
    root,
    artifacts: path.join(root, 'artifacts'),
    context: path.join(root, 'context'),
    agents: path.join(root, 'agents'),
    tasks: path.join(root, 'tasks'),
    work: path.join(root, 'work'),
    logs: path.join(root, 'logs')
  } satisfies WorkspacePaths;

  Object.values(paths).forEach((directory) => mkdirSync(directory, { recursive: true }));
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

async function buildSnapshot() {
  const snapshot = storage.getWorkspaceSnapshot();
  const [runtimeStatus, models] = await Promise.all([runtime.getStatus(), refreshStoredModels()]);

  return {
    profile: snapshot.profile,
    agents: snapshot.agents,
    groups: snapshot.groups,
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
  writeJsonFile(path.join(paths.tasks, 'index.json'), snapshot.tasks);
  writeJsonFile(path.join(paths.work, 'work-items.json'), snapshot.workItems);
  writeJsonFile(path.join(paths.work, 'artifacts.json'), snapshot.artifacts);

  for (const agent of snapshot.agents) {
    writeJsonFile(path.join(paths.agents, `${agent.slug}.json`), agent);
  }

  for (const task of snapshot.tasks) {
    writeJsonFile(path.join(paths.tasks, `${task.id}.json`), task);
  }
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
  storage = new SqliteStorage(getDatabasePath());
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
  ipcMain.handle(channels.prismSend, async (_event, input: PrismRequest) => {
    const reply = await runtime.sendPrismRequest(input);
    if (reply.createdAgent) {
      storage.upsertAgent(reply.createdAgent);
      syncStructuredExports();
    }
    await extractAndPersistMemories('chat', `prism:${reply.id}`, `${input.message}\n\n${reply.text}`);
    return reply;
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
