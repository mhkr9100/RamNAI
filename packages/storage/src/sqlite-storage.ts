import { DatabaseSync } from 'node:sqlite';
import {
  AgentSpec,
  ArtifactRecord,
  ChatThread,
  DEFAULT_MODEL_PRESETS,
  EMPTY_PRIVATE_USERMAP_TREE,
  EMPTY_PUBLIC_USERMAP_TREE,
  EMPTY_USERMAP_STATE,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  ProviderModelPreset,
  ProviderAuthSelection,
  PrismProviderOverrideSettings,
  TaskSpec,
  TaskRunRecord,
  UserMapNode,
  UserMapState,
  WorkItem
} from '@supreme/shared';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface WorkspaceSnapshot {
  profile: LocalProfile | null;
  agents: AgentSpec[];
  groups: GroupSpec[];
  chatThreads: ChatThread[];
  tasks: TaskSpec[];
  taskRuns: TaskRunRecord[];
  workItems: WorkItem[];
  artifacts: ArtifactRecord[];
  userMap: UserMapState;
  publicUserMap: UserMapNode;
  privateUserMap: UserMapNode;
  memoryFacts: MemoryFact[];
  publicMemoryFacts: MemoryFact[];
  privateMemoryFacts: MemoryFact[];
  models: ProviderModelPreset[];
}

type VisibilityScope = 'public' | 'private';

function cloneUserMapNode(node: UserMapNode, inheritedVisibility?: VisibilityScope): UserMapNode {
  const visibility = node.visibility ?? inheritedVisibility;
  return {
    ...node,
    ...(visibility ? { visibility } : {}),
    children: node.children.map((child) => cloneUserMapNode(child, visibility))
  };
}

function normalizeUserMapTree(tree: UserMapNode, visibility: VisibilityScope): UserMapNode {
  const base = cloneUserMapNode(tree, visibility);
  return {
    ...base,
    visibility,
    children: base.children.map((child) => cloneUserMapNode(child, visibility))
  };
}

function normalizeUserMapState(state: UserMapState): UserMapState {
  return {
    publicTree: normalizeUserMapTree(state.publicTree, 'public'),
    privateTree: normalizeUserMapTree(state.privateTree, 'private')
  };
}

function coerceUserMapState(value: unknown): UserMapState {
  if (value && typeof value === 'object') {
    const candidate = value as Partial<UserMapState> & Partial<UserMapNode> & { children?: UserMapNode[]; visibility?: VisibilityScope };
    if (candidate.publicTree && candidate.privateTree) {
      return normalizeUserMapState({
        publicTree: candidate.publicTree,
        privateTree: candidate.privateTree
      });
    }

    if (Array.isArray(candidate.children)) {
      const publicTree = candidate.children.find((child) => child.visibility === 'public') ?? EMPTY_PUBLIC_USERMAP_TREE;
      const legacyPrivateChildren = candidate.children.filter((child) => child.visibility !== 'public');
      const privateTree = candidate.children.find((child) => child.visibility === 'private')
        ?? {
          ...EMPTY_PRIVATE_USERMAP_TREE,
          children: legacyPrivateChildren.length ? legacyPrivateChildren : EMPTY_PRIVATE_USERMAP_TREE.children
        };
      return normalizeUserMapState({ publicTree, privateTree });
    }
  }

  return EMPTY_USERMAP_STATE;
}

function stateRoots(state: UserMapState) {
  return {
    publicRoot: state.publicTree,
    privateRoot: state.privateTree
  };
}

function memoryVisibility(fact: MemoryFact): VisibilityScope {
  return fact.visibility ?? 'public';
}

export class SqliteStorage {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS groups_table (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usermap (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_auth_state (
        provider TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prism_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
    `);

    const count = this.db.prepare('SELECT COUNT(*) as count FROM models').get() as { count: number };
    if (count.count === 0) {
      const insert = this.db.prepare('INSERT INTO models (id, payload) VALUES (?, ?)');
      for (const model of DEFAULT_MODEL_PRESETS) {
        insert.run(model.id, JSON.stringify(model));
      }
    }

    const userMapRow = this.db.prepare('SELECT payload FROM usermap WHERE id = 1').get() as { payload?: string } | undefined;
    if (!userMapRow) {
      this.db.prepare('INSERT INTO usermap (id, payload) VALUES (1, ?)').run(JSON.stringify(EMPTY_USERMAP_STATE));
    } else {
      const parsed = parseJson<unknown>(userMapRow.payload ?? '', EMPTY_USERMAP_STATE);
      const normalized = coerceUserMapState(parsed);
      this.db.prepare('INSERT OR REPLACE INTO usermap (id, payload) VALUES (1, ?)').run(JSON.stringify(normalized));
    }

    const prismSettingsRow = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    if (!prismSettingsRow) {
      this.db.prepare('INSERT INTO prism_settings (id, payload) VALUES (1, ?)').run(JSON.stringify({}));
    }
  }

  getProfile(): LocalProfile | null {
    const row = this.db.prepare('SELECT payload FROM profile WHERE id = 1').get() as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  saveProfile(profile: LocalProfile): LocalProfile {
    this.db.prepare('INSERT OR REPLACE INTO profile (id, payload) VALUES (1, ?)').run(JSON.stringify(profile));
    return profile;
  }

  getUserMap(): UserMapState {
    const row = this.db.prepare('SELECT payload FROM usermap WHERE id = 1').get() as { payload?: string } | undefined;
    return coerceUserMapState(parseJson(row?.payload, EMPTY_USERMAP_STATE));
  }

  saveUserMap(tree: UserMapState): UserMapState {
    const normalized = normalizeUserMapState(tree);
    this.db.prepare('INSERT OR REPLACE INTO usermap (id, payload) VALUES (1, ?)').run(JSON.stringify(normalized));
    return normalized;
  }

  getUserMapRoots(): { publicRoot: UserMapNode; privateRoot: UserMapNode } {
    const state = this.getUserMap();
    return stateRoots(state);
  }

  saveUserMapRoots(roots: { publicRoot: UserMapNode; privateRoot: UserMapNode }) {
    return this.saveUserMap({
      publicTree: roots.publicRoot,
      privateTree: roots.privateRoot
    });
  }

  listAgents(): AgentSpec[] {
    const rows = this.db.prepare('SELECT payload FROM agents ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  getAgent(agentId: string): AgentSpec | null {
    const row = this.db.prepare('SELECT payload FROM agents WHERE id = ?').get(agentId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertAgent(agent: AgentSpec): AgentSpec {
    this.db.prepare('INSERT OR REPLACE INTO agents (id, payload) VALUES (?, ?)').run(agent.id, JSON.stringify(agent));
    return agent;
  }

  deleteAgent(agentId: string) {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
  }

  listGroups(): GroupSpec[] {
    const rows = this.db.prepare('SELECT payload FROM groups_table ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  upsertGroup(group: GroupSpec): GroupSpec {
    this.db.prepare('INSERT OR REPLACE INTO groups_table (id, payload) VALUES (?, ?)').run(group.id, JSON.stringify(group));
    return group;
  }

  deleteGroup(groupId: string) {
    this.db.prepare('DELETE FROM groups_table WHERE id = ?').run(groupId);
  }

  listChatThreads(): ChatThread[] {
    const rows = this.db.prepare('SELECT payload FROM chat_threads ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  getChatThread(threadId: string): ChatThread | null {
    const row = this.db.prepare('SELECT payload FROM chat_threads WHERE id = ?').get(threadId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertChatThread(thread: ChatThread): ChatThread {
    this.db.prepare('INSERT OR REPLACE INTO chat_threads (id, payload) VALUES (?, ?)').run(thread.id, JSON.stringify(thread));
    return thread;
  }

  deleteChatThread(threadId: string) {
    this.db.prepare('DELETE FROM chat_threads WHERE id = ?').run(threadId);
  }

  listTasks(): TaskSpec[] {
    const rows = this.db.prepare('SELECT payload FROM tasks ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  getTask(taskId: string): TaskSpec | null {
    const row = this.db.prepare('SELECT payload FROM tasks WHERE id = ?').get(taskId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertTask(task: TaskSpec): TaskSpec {
    this.db.prepare('INSERT OR REPLACE INTO tasks (id, payload) VALUES (?, ?)').run(task.id, JSON.stringify(task));
    return task;
  }

  deleteTask(taskId: string) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  listTaskRuns(taskId?: string): TaskRunRecord[] {
    const rows = taskId
      ? this.db.prepare('SELECT payload FROM task_runs WHERE task_id = ? ORDER BY updated_at DESC, id DESC').all(taskId) as Array<{ payload: string }>
      : this.db.prepare('SELECT payload FROM task_runs ORDER BY updated_at DESC, id DESC').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  getTaskRun(runId: string): TaskRunRecord | null {
    const row = this.db.prepare('SELECT payload FROM task_runs WHERE id = ?').get(runId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertTaskRun(run: TaskRunRecord): TaskRunRecord {
    this.db.prepare('INSERT OR REPLACE INTO task_runs (id, task_id, updated_at, payload) VALUES (?, ?, ?, ?)').run(
      run.id,
      run.taskId,
      run.updatedAt,
      JSON.stringify(run)
    );
    return run;
  }

  deleteTaskRun(runId: string) {
    this.db.prepare('DELETE FROM task_runs WHERE id = ?').run(runId);
  }

  listWorkItems(): WorkItem[] {
    const rows = this.db.prepare('SELECT payload FROM work_items').all() as Array<{ payload: string }>;
    return rows
      .map((row) => parseJson<WorkItem | null>(row.payload, null))
      .filter((item): item is WorkItem => item !== null)
      .sort((left, right) => {
        const leftUpdated = Date.parse(left.updatedAt || left.createdAt || '');
        const rightUpdated = Date.parse(right.updatedAt || right.createdAt || '');
        if (!Number.isNaN(leftUpdated) && !Number.isNaN(rightUpdated) && leftUpdated !== rightUpdated) {
          return rightUpdated - leftUpdated;
        }
        return right.id.localeCompare(left.id);
      });
  }

  getWorkItem(workItemId: string): WorkItem | null {
    const row = this.db.prepare('SELECT payload FROM work_items WHERE id = ?').get(workItemId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertWorkItem(item: WorkItem): WorkItem {
    this.db.prepare('INSERT OR REPLACE INTO work_items (id, payload) VALUES (?, ?)').run(item.id, JSON.stringify(item));
    return item;
  }

  deleteWorkItem(workItemId: string) {
    this.db.prepare('DELETE FROM work_items WHERE id = ?').run(workItemId);
  }

  listArtifacts(): ArtifactRecord[] {
    const rows = this.db.prepare('SELECT payload FROM artifacts ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  getArtifact(artifactId: string): ArtifactRecord | null {
    const row = this.db.prepare('SELECT payload FROM artifacts WHERE id = ?').get(artifactId) as { payload?: string } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertArtifact(artifact: ArtifactRecord): ArtifactRecord {
    this.db.prepare('INSERT OR REPLACE INTO artifacts (id, payload) VALUES (?, ?)').run(artifact.id, JSON.stringify(artifact));
    return artifact;
  }

  deleteArtifact(artifactId: string) {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(artifactId);
  }

  listMemoryFacts(visibility?: VisibilityScope): MemoryFact[] {
    const rows = this.db.prepare('SELECT payload FROM memory_facts ORDER BY id').all() as Array<{ payload: string }>;
    return rows
      .map((row) => parseJson<MemoryFact>(row.payload, null as never))
      .filter((fact) => fact !== null)
      .filter((fact) => (visibility ? memoryVisibility(fact) === visibility : true));
  }

  upsertMemoryFacts(facts: MemoryFact[]): MemoryFact[] {
    const insert = this.db.prepare('INSERT OR REPLACE INTO memory_facts (id, payload) VALUES (?, ?)');
    for (const fact of facts) {
      insert.run(fact.id, JSON.stringify(fact));
    }
    return facts;
  }

  clearMemoryFacts() {
    this.db.exec('DELETE FROM memory_facts');
  }

  listModels(): ProviderModelPreset[] {
    const rows = this.db.prepare('SELECT payload FROM models ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
  }

  updateModel(model: ProviderModelPreset): ProviderModelPreset {
    this.db.prepare('INSERT OR REPLACE INTO models (id, payload) VALUES (?, ?)').run(model.id, JSON.stringify(model));
    return model;
  }

  getProviderAuthSelection(provider: string): ProviderAuthSelection | null {
    const row = this.db.prepare('SELECT payload FROM provider_auth_state WHERE provider = ?').get(provider) as {
      payload?: string;
    } | undefined;
    return row?.payload ? parseJson(row.payload, null) : null;
  }

  upsertProviderAuthSelection(selection: ProviderAuthSelection): ProviderAuthSelection {
    this.db.prepare('INSERT OR REPLACE INTO provider_auth_state (provider, payload) VALUES (?, ?)').run(
      selection.provider,
      JSON.stringify(selection)
    );
    return selection;
  }

  getPrismProviderOverride(): PrismProviderOverrideSettings | null {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? parseJson<Record<string, unknown>>(row.payload, {}) : {};
    const override = parsed.providerOverride;
    if (!override || typeof override !== 'object') {
      return null;
    }
    const candidate = override as PrismProviderOverrideSettings;
    if (!candidate.provider || !candidate.modelId) {
      return null;
    }
    return candidate;
  }

  savePrismProviderOverride(override: PrismProviderOverrideSettings | null): PrismProviderOverrideSettings | null {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? parseJson<Record<string, unknown>>(row.payload, {}) : {};
    const next = {
      ...parsed,
      providerOverride: override ?? null
    };
    this.db.prepare('INSERT OR REPLACE INTO prism_settings (id, payload) VALUES (1, ?)').run(JSON.stringify(next));
    return override;
  }

  getWorkspaceSnapshot(): WorkspaceSnapshot {
    const userMap = this.getUserMap();
    const { publicRoot, privateRoot } = stateRoots(userMap);
    const memoryFacts = this.listMemoryFacts();
    return {
      profile: this.getProfile(),
      agents: this.listAgents(),
      groups: this.listGroups(),
      chatThreads: this.listChatThreads(),
      tasks: this.listTasks(),
      taskRuns: this.listTaskRuns(),
      workItems: this.listWorkItems(),
      artifacts: this.listArtifacts(),
      userMap,
      publicUserMap: publicRoot,
      privateUserMap: privateRoot,
      memoryFacts,
      publicMemoryFacts: memoryFacts.filter((fact) => memoryVisibility(fact) === 'public'),
      privateMemoryFacts: memoryFacts.filter((fact) => memoryVisibility(fact) === 'private'),
      models: this.listModels()
    };
  }
}
