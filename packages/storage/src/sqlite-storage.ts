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
const STORAGE_SCHEMA_VERSION = 2;

interface TaskRunRow {
  id: string;
  task_id: string;
  status?: string;
  claimed_at?: string | null;
  lease_expires_at?: string | null;
  created_at?: string | null;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  worker_id?: string | null;
  attempt?: number | null;
  run_index?: number | null;
  target?: string | null;
  provider?: string | null;
  model_id?: string | null;
  summary?: string | null;
  last_error?: string | null;
  claim_token?: string | null;
  artifact_ids?: string | null;
  council_trace?: string | null;
  payload?: string | null;
}

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

function taskRunPayload(run: TaskRunRecord): string {
  return JSON.stringify(run);
}

function taskRunColumns(run: TaskRunRecord) {
  return {
    id: run.id,
    task_id: run.taskId,
    status: run.status,
    claimed_at: run.claimedAt ?? null,
    lease_expires_at: run.leaseExpiresAt ?? null,
    created_at: run.createdAt ?? null,
    updated_at: run.updatedAt,
    started_at: run.startedAt ?? null,
    completed_at: run.completedAt ?? null,
    worker_id: run.workerId ?? null,
    attempt: run.attempt ?? null,
    run_index: run.runIndex ?? null,
    target: run.target ? JSON.stringify(run.target) : null,
    provider: run.provider ?? null,
    model_id: run.modelId ?? null,
    summary: run.summary ?? null,
    last_error: run.lastError ?? null,
    claim_token: run.claimToken ?? null,
    artifact_ids: run.artifactIds ? JSON.stringify(run.artifactIds) : null,
    council_trace: run.councilTrace ? JSON.stringify(run.councilTrace) : null,
    payload: taskRunPayload(run)
  };
}

function taskRunFromRow(row: TaskRunRow): TaskRunRecord {
  const payload = row.payload ? parseJson<TaskRunRecord | null>(row.payload, null) : null;
  if (payload) {
    // Some runtime paths (lease renewal / cancellation) update SQL columns without rewriting the JSON payload.
    // Prefer column values for the fields we mutate via SQL updates.
    return {
      ...payload,
      ...(row.status ? { status: row.status as TaskRunRecord['status'] } : {}),
      ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
      ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
      ...(row.completed_at ? { completedAt: row.completed_at } : {}),
      ...(row.last_error ? { lastError: row.last_error } : {})
    };
  }

  const target = row.target ? parseJson<TaskRunRecord['target'] | null>(row.target, null) : null;
  const artifactIds = row.artifact_ids ? parseJson<string[]>(row.artifact_ids, []) : undefined;
  const councilTrace = row.council_trace
    ? parseJson<NonNullable<TaskRunRecord['councilTrace']> | null>(row.council_trace, null)
    : null;
  const provider = row.provider ? (row.provider as NonNullable<TaskRunRecord['provider']>) : null;

  return {
    id: row.id,
    taskId: row.task_id,
    status: (row.status as TaskRunRecord['status']) ?? 'running',
    updatedAt: row.updated_at,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.claimed_at ? { claimedAt: row.claimed_at } : {}),
    ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.worker_id ? { workerId: row.worker_id } : {}),
    ...(row.attempt !== null && row.attempt !== undefined ? { attempt: row.attempt } : {}),
    ...(row.run_index !== null && row.run_index !== undefined ? { runIndex: row.run_index } : {}),
    ...(target ? { target } : {}),
    ...(provider ? { provider } : {}),
    ...(row.model_id ? { modelId: row.model_id } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.claim_token ? { claimToken: row.claim_token } : {}),
    ...(artifactIds ? { artifactIds } : {}),
    ...(councilTrace ? { councilTrace } : {})
  };
}

export class SqliteStorage {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  close() {
    this.db.close();
  }

  private readSchemaVersion(): number {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    return row?.user_version ?? 0;
  }

  getSchemaVersion(): number {
    return this.readSchemaVersion();
  }

  private setSchemaVersion(version: number) {
    this.db.exec(`PRAGMA user_version = ${Math.max(0, Math.floor(version))};`);
  }

  private ensureTaskRunSchemaColumns() {
    const columns = new Set(
      (this.db.prepare('PRAGMA table_info(task_runs)').all() as Array<{ name: string }>)
        .map((row) => row.name)
    );
    const additions: Array<[string, string]> = [
      ['status', 'TEXT NOT NULL DEFAULT \'claimed\''],
      ['claimed_at', 'TEXT'],
      ['lease_expires_at', 'TEXT'],
      ['created_at', 'TEXT'],
      ['started_at', 'TEXT'],
      ['completed_at', 'TEXT'],
      ['worker_id', 'TEXT'],
      ['attempt', 'INTEGER'],
      ['run_index', 'INTEGER'],
      ['target', 'TEXT'],
      ['provider', 'TEXT'],
      ['model_id', 'TEXT'],
      ['summary', 'TEXT'],
      ['last_error', 'TEXT'],
      ['claim_token', 'TEXT'],
      ['artifact_ids', 'TEXT'],
      ['council_trace', 'TEXT']
    ];

    for (const [name, definition] of additions) {
      if (columns.has(name)) {
        continue;
      }

      this.db.exec(`ALTER TABLE task_runs ADD COLUMN ${name} ${definition};`);
    }

    this.db.exec('CREATE INDEX IF NOT EXISTS task_runs_task_id_idx ON task_runs(task_id, updated_at DESC, id DESC);');
    this.db.exec('CREATE INDEX IF NOT EXISTS task_runs_lease_idx ON task_runs(status, lease_expires_at, updated_at DESC);');
  }

  private backfillTaskRunSchema() {
    const rows = this.db.prepare('SELECT * FROM task_runs').all() as unknown as TaskRunRow[];
    const update = this.db.prepare(`
      UPDATE task_runs
      SET status = ?, claimed_at = ?, lease_expires_at = ?, created_at = ?, updated_at = ?, started_at = ?,
          completed_at = ?, worker_id = ?, attempt = ?, run_index = ?, target = ?, provider = ?, model_id = ?,
          summary = ?, last_error = ?, claim_token = ?, artifact_ids = ?, council_trace = ?, payload = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      const run = taskRunFromRow(row);
      const columns = taskRunColumns(run);
      update.run(
        columns.status,
        columns.claimed_at,
        columns.lease_expires_at,
        columns.created_at,
        columns.updated_at,
        columns.started_at,
        columns.completed_at,
        columns.worker_id,
        columns.attempt,
        columns.run_index,
        columns.target,
        columns.provider,
        columns.model_id,
        columns.summary,
        columns.last_error,
        columns.claim_token,
        columns.artifact_ids,
        columns.council_trace,
        columns.payload,
        columns.id
      );
    }
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
        status TEXT NOT NULL DEFAULT 'claimed',
        claimed_at TEXT,
        lease_expires_at TEXT,
        created_at TEXT,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        worker_id TEXT,
        attempt INTEGER,
        run_index INTEGER,
        target TEXT,
        provider TEXT,
        model_id TEXT,
        summary TEXT,
        last_error TEXT,
        claim_token TEXT,
        artifact_ids TEXT,
        council_trace TEXT,
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

    this.ensureTaskRunSchemaColumns();

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

    const schemaVersion = this.readSchemaVersion();
    if (schemaVersion < STORAGE_SCHEMA_VERSION) {
      this.backfillTaskRunSchema();
      this.setSchemaVersion(STORAGE_SCHEMA_VERSION);
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
      ? (this.db.prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY updated_at DESC, id DESC').all(taskId) as unknown as TaskRunRow[])
      : (this.db.prepare('SELECT * FROM task_runs ORDER BY updated_at DESC, id DESC').all() as unknown as TaskRunRow[]);
    return rows.map(taskRunFromRow);
  }

  listActiveTaskRuns(taskId?: string, now = new Date()): TaskRunRecord[] {
    const rows = taskId
      ? this.db.prepare(`
          SELECT * FROM task_runs
          WHERE task_id = ? AND status IN ('claimed', 'running')
            AND (lease_expires_at IS NULL OR lease_expires_at > ?)
          ORDER BY updated_at DESC, id DESC
        `).all(taskId, now.toISOString()) as unknown as TaskRunRow[]
      : this.db.prepare(`
          SELECT * FROM task_runs
          WHERE status IN ('claimed', 'running')
            AND (lease_expires_at IS NULL OR lease_expires_at > ?)
          ORDER BY updated_at DESC, id DESC
        `).all(now.toISOString()) as unknown as TaskRunRow[];
    return rows.map(taskRunFromRow);
  }

  renewTaskRunLease(runId: string, claimToken: string, newLeaseExpiresAt: string, updatedAt: string) {
    // Lease renewal is guarded by (run id + claim token) so only the current holder can extend.
    this.db.prepare(`
      UPDATE task_runs
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND claim_token = ?
        AND status IN ('claimed', 'running')
    `).run(newLeaseExpiresAt, updatedAt, runId, claimToken);
  }

  cancelTaskRunsByTaskId(taskId: string, completedAt: string, reason: string) {
    // Used by rerun/cancel flows to prevent stale claimed/running runs from blocking new executions.
    this.db.prepare(`
      UPDATE task_runs
      SET
        status = 'cancelled',
        lease_expires_at = ?,
        completed_at = ?,
        updated_at = ?,
        last_error = ?
      WHERE task_id = ? AND status IN ('claimed', 'running')
    `).run(completedAt, completedAt, completedAt, reason, taskId);
  }

  nextTaskRunAttempt(taskId: string): number {
    const rows = this.db.prepare('SELECT attempt, run_index FROM task_runs WHERE task_id = ?').all(taskId) as Array<{
      attempt?: number | null;
      run_index?: number | null;
    }>;
    const values = rows.flatMap((row) => [row.attempt, row.run_index]).filter((value): value is number => typeof value === 'number');
    return (values.length ? Math.max(...values) : 0) + 1;
  }

  getTaskRun(runId: string): TaskRunRecord | null {
    const row = this.db.prepare('SELECT * FROM task_runs WHERE id = ?').get(runId) as unknown as TaskRunRow | undefined;
    return row ? taskRunFromRow(row) : null;
  }

  upsertTaskRun(run: TaskRunRecord): TaskRunRecord {
    const columns = taskRunColumns(run);
    this.db.prepare(`
      INSERT OR REPLACE INTO task_runs (
        id, task_id, status, claimed_at, lease_expires_at, created_at, updated_at, started_at, completed_at,
        worker_id, attempt, run_index, target, provider, model_id, summary, last_error, claim_token,
        artifact_ids, council_trace, payload
      ) VALUES (
        @id, @task_id, @status, @claimed_at, @lease_expires_at, @created_at, @updated_at, @started_at, @completed_at,
        @worker_id, @attempt, @run_index, @target, @provider, @model_id, @summary, @last_error, @claim_token,
        @artifact_ids, @council_trace, @payload
      )
    `).run(columns);
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
