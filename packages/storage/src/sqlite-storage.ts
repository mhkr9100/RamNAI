import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  AgentMode,
  AgentSpec,
  ArtifactRecord,
  AuditEventKind,
  ChatThread,
  DEFAULT_MODEL_PRESETS,
  EMPTY_PRIVATE_USERMAP_TREE,
  EMPTY_PUBLIC_USERMAP_TREE,
  EMPTY_USERMAP_STATE,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  Permission,
  ProviderModelPreset,
  ProviderAuthSelection,
  PrismProviderOverrideSettings,
  ROLE_PERMISSIONS,
  TaskSpec,
  TaskRunRecord,
  UserMapNode,
  UserMapState,
  VoiceConfig,
  WorkspaceRole,
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
  /** Present when snapshot was built with pagination limits (lite mode) */
  counts?: WorkspaceSnapshotCounts;
}

export interface GetWorkspaceSnapshotOptions {
  tasksLimit?: number;
  workItemsLimit?: number;
  chatThreadsLimit?: number;
}

export interface StorageTextCipher {
  id: string;
  enabled: boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
  isEncrypted(value: string): boolean;
}

type VisibilityScope = 'public' | 'private';
const STORAGE_SCHEMA_VERSION = 3;
const PASSTHROUGH_TEXT_CIPHER: StorageTextCipher = {
  id: 'plain',
  enabled: false,
  encrypt(value: string) {
    return value;
  },
  decrypt(value: string) {
    return value;
  },
  isEncrypted() {
    return false;
  }
};
const TEXT_CIPHER_TABLES: Array<{ table: string; columns: string[] }> = [
  { table: 'profile', columns: ['payload'] },
  { table: 'agents', columns: ['payload'] },
  { table: 'groups_table', columns: ['payload'] },
  { table: 'chat_threads', columns: ['payload'] },
  { table: 'tasks', columns: ['payload'] },
  { table: 'work_items', columns: ['payload'] },
  { table: 'task_runs', columns: ['target', 'summary', 'last_error', 'artifact_ids', 'council_trace', 'payload'] },
  { table: 'artifacts', columns: ['payload'] },
  { table: 'usermap', columns: ['payload'] },
  { table: 'memory_facts', columns: ['payload'] },
  { table: 'models', columns: ['payload'] },
  { table: 'provider_auth_state', columns: ['payload'] },
  { table: 'prism_settings', columns: ['payload'] },
  { table: 'voice_config', columns: ['payload'] },
  { table: 'audit_log', columns: ['payload'] }
];

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

function sortWorkItems(items: WorkItem[]) {
  return items.sort((left, right) => {
    const leftUpdated = Date.parse(left.updatedAt || left.createdAt || '');
    const rightUpdated = Date.parse(right.updatedAt || right.createdAt || '');
    if (!Number.isNaN(leftUpdated) && !Number.isNaN(rightUpdated) && leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated;
    }
    return right.id.localeCompare(left.id);
  });
}

export class SqliteStorage {
  private readonly db: DatabaseSync;
  private textCipher: StorageTextCipher;

  constructor(private readonly dbPath: string, options?: { textCipher?: StorageTextCipher }) {
    this.db = new DatabaseSync(dbPath);
    this.textCipher = options?.textCipher ?? PASSTHROUGH_TEXT_CIPHER;
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  close() {
    this.db.close();
  }

  getTextCipherId(): string {
    return this.textCipher.id;
  }

  rotateTextCipher(nextCipher: StorageTextCipher): void {
    const currentCipher = this.textCipher;
    if (currentCipher.id === nextCipher.id && currentCipher.enabled === nextCipher.enabled) {
      this.textCipher = nextCipher;
      return;
    }

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for (const target of TEXT_CIPHER_TABLES) {
        const select = this.db.prepare(
          `SELECT rowid AS __rowid__, ${target.columns.join(', ')} FROM ${target.table}`
        );
        const rows = select.all() as Array<Record<string, string | number | null>>;
        if (rows.length === 0) continue;

        const assignments = target.columns.map((column) => `${column} = ?`).join(', ');
        const update = this.db.prepare(`UPDATE ${target.table} SET ${assignments} WHERE rowid = ?`);

        for (const row of rows) {
          const transformed = target.columns.map((column) => {
            const raw = row[column];
            if (typeof raw !== 'string') {
              return raw ?? null;
            }

            const plain = currentCipher.isEncrypted(raw) ? currentCipher.decrypt(raw) : raw;
            return nextCipher.enabled ? nextCipher.encrypt(plain) : plain;
          });
          update.run(...transformed.map((v) => v ?? null), row.__rowid__ ?? null);
        }
      }

      this.db.exec('COMMIT;');
      this.textCipher = nextCipher;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  private encodeText(value: string): string {
    if (!this.textCipher.enabled) {
      return value;
    }

    if (this.textCipher.isEncrypted(value)) {
      return value;
    }

    return this.textCipher.encrypt(value);
  }

  private encodeOptionalText(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }

    return this.encodeText(value);
  }

  private decodeText(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return this.textCipher.isEncrypted(value) ? this.textCipher.decrypt(value) : value;
  }

  private decodeOptionalText(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }

    return this.decodeText(value);
  }

  private encodeJson(value: unknown): string {
    return this.encodeText(JSON.stringify(value));
  }

  private decodeJson<T>(value: string | null | undefined, fallback: T): T {
    return parseJson<T>(this.decodeText(value), fallback);
  }

  private taskRunColumns(run: TaskRunRecord) {
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
      target: this.encodeOptionalText(run.target ? JSON.stringify(run.target) : null),
      provider: run.provider ?? null,
      model_id: run.modelId ?? null,
      summary: this.encodeOptionalText(run.summary ?? null),
      last_error: this.encodeOptionalText(run.lastError ?? null),
      claim_token: run.claimToken ?? null,
      artifact_ids: this.encodeOptionalText(run.artifactIds ? JSON.stringify(run.artifactIds) : null),
      council_trace: this.encodeOptionalText(run.councilTrace ? JSON.stringify(run.councilTrace) : null),
      payload: this.encodeJson(run)
    };
  }

  private taskRunFromRow(row: TaskRunRow): TaskRunRecord {
    const payload = row.payload ? this.decodeJson<TaskRunRecord | null>(row.payload, null) : null;
    const decodedLastError = this.decodeOptionalText(row.last_error) ?? undefined;
    if (payload) {
      return {
        ...payload,
        ...(row.status ? { status: row.status as TaskRunRecord['status'] } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
        ...(row.lease_expires_at ? { leaseExpiresAt: row.lease_expires_at } : {}),
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(decodedLastError ? { lastError: decodedLastError } : {})
      };
    }

    const decodedTarget = this.decodeOptionalText(row.target);
    const decodedArtifactIds = this.decodeOptionalText(row.artifact_ids);
    const decodedCouncilTrace = this.decodeOptionalText(row.council_trace);
    const decodedSummary = this.decodeOptionalText(row.summary) ?? undefined;
    const target = decodedTarget ? parseJson<TaskRunRecord['target'] | null>(decodedTarget, null) : null;
    const artifactIds = decodedArtifactIds ? parseJson<string[]>(decodedArtifactIds, []) : undefined;
    const councilTrace = decodedCouncilTrace
      ? parseJson<NonNullable<TaskRunRecord['councilTrace']> | null>(decodedCouncilTrace, null)
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
      ...(decodedSummary ? { summary: decodedSummary } : {}),
      ...(decodedLastError ? { lastError: decodedLastError } : {}),
      ...(row.claim_token ? { claimToken: row.claim_token } : {}),
      ...(artifactIds ? { artifactIds } : {}),
      ...(councilTrace ? { councilTrace } : {})
    };
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
      const run = this.taskRunFromRow(row);
      const columns = this.taskRunColumns(run);
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
      CREATE TABLE IF NOT EXISTS voice_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        entity_id TEXT,
        entity_type TEXT,
        payload TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureTaskRunSchemaColumns();

    const count = this.db.prepare('SELECT COUNT(*) as count FROM models').get() as { count: number };
    if (count.count === 0) {
      const insert = this.db.prepare('INSERT INTO models (id, payload) VALUES (?, ?)');
      for (const model of DEFAULT_MODEL_PRESETS) {
        insert.run(model.id, this.encodeJson(model));
      }
    }

    const userMapRow = this.db.prepare('SELECT payload FROM usermap WHERE id = 1').get() as { payload?: string } | undefined;
    if (!userMapRow) {
      this.db.prepare('INSERT INTO usermap (id, payload) VALUES (1, ?)').run(this.encodeJson(EMPTY_USERMAP_STATE));
    } else {
      const parsed = this.decodeJson<unknown>(userMapRow.payload ?? '', EMPTY_USERMAP_STATE);
      const normalized = coerceUserMapState(parsed);
      this.db.prepare('INSERT OR REPLACE INTO usermap (id, payload) VALUES (1, ?)').run(this.encodeJson(normalized));
    }

    const prismSettingsRow = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    if (!prismSettingsRow) {
      this.db.prepare('INSERT INTO prism_settings (id, payload) VALUES (1, ?)').run(this.encodeJson({}));
    }

    const schemaVersion = this.readSchemaVersion();
    if (schemaVersion < STORAGE_SCHEMA_VERSION) {
      this.backfillTaskRunSchema();
      this.setSchemaVersion(STORAGE_SCHEMA_VERSION);
    }
  }

  appendAuditEvent(event: {
    kind: AuditEventKind;
    entityId?: string;
    entityType?: string;
    payload?: Record<string, unknown>;
    createdAt: string;
  }): void {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO audit_log (id, kind, entity_id, entity_type, payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      event.kind,
      event.entityId ?? null,
      event.entityType ?? null,
      event.payload ? this.encodeJson(event.payload) : null,
      event.createdAt
    );
  }

  listAuditEvents(limit = 500, offset = 0): Array<{ id: string; kind: AuditEventKind; entityId?: string; entityType?: string; payload?: Record<string, unknown>; createdAt: string }> {
    const rows = this.db.prepare(`
      SELECT id, kind, entity_id, entity_type, payload, created_at
      FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<{ id: string; kind: string; entity_id?: string | null; entity_type?: string | null; payload?: string | null; created_at: string }>;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as AuditEventKind,
      ...(row.entity_id ? { entityId: row.entity_id } : {}),
      ...(row.entity_type ? { entityType: row.entity_type } : {}),
      ...(row.payload ? { payload: this.decodeJson(row.payload, {}) } : {}),
      createdAt: row.created_at
    }));
  }

  exportAuditLog(format: 'json' | 'csv', limit = 5000): string {
    const events = this.listAuditEvents(limit, 0);
    if (format === 'json') {
      return JSON.stringify({ exportedAt: new Date().toISOString(), count: events.length, events }, null, 2);
    }
    const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
    const header = 'id,kind,entityId,entityType,payload,createdAt';
    const rows = events.map((e) => {
      const payload = e.payload ? escape(JSON.stringify(e.payload)) : '';
      return [escape(e.id), escape(e.kind), escape(e.entityId ?? ''), escape(e.entityType ?? ''), payload, escape(e.createdAt)].join(',');
    });
    return [header, ...rows].join('\n');
  }

  getTaskRunMetrics(sinceDays = 30): {
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    modelUsage: Array<{ provider: string; modelId: string; count: number }>;
    avgLatencyMs: number | null;
  } {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    const sinceIso = since.toISOString();
    const rows = this.db.prepare(`
      SELECT status, provider, model_id, started_at, completed_at
      FROM task_runs WHERE updated_at >= ?
    `).all(sinceIso) as Array<{ status: string; provider?: string | null; model_id?: string | null; started_at?: string | null; completed_at?: string | null }>;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    const modelCounts = new Map<string, number>();
    let totalLatencyMs = 0;
    let latencyCount = 0;
    for (const r of rows) {
      if (r.status === 'done') completed++;
      else if (r.status === 'failed') failed++;
      else if (r.status === 'cancelled') cancelled++;
      const key = r.provider && r.model_id ? `${r.provider}:${r.model_id}` : null;
      if (key) modelCounts.set(key, (modelCounts.get(key) ?? 0) + 1);
      if (r.started_at && r.completed_at && r.status === 'done') {
        const ms = Date.parse(r.completed_at) - Date.parse(r.started_at);
        if (!Number.isNaN(ms) && ms >= 0) {
          totalLatencyMs += ms;
          latencyCount++;
        }
      }
    }
    const total = completed + failed + cancelled;
    const modelUsage = Array.from(modelCounts.entries())
      .map(([key, count]) => {
        const idx = key.indexOf(':');
        const provider = idx >= 0 ? key.slice(0, idx) : '';
        const modelId = idx >= 0 ? key.slice(idx + 1) : '';
        return provider && modelId ? { provider, modelId, count } : null;
      })
      .filter((r): r is { provider: string; modelId: string; count: number } => r !== null)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    return {
      completed,
      failed,
      cancelled,
      successRate: total > 0 ? completed / total : 0,
      modelUsage,
      avgLatencyMs: latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : null
    };
  }

  getProfile(): LocalProfile | null {
    const row = this.db.prepare('SELECT payload FROM profile WHERE id = 1').get() as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  saveProfile(profile: LocalProfile): LocalProfile {
    this.db.prepare('INSERT OR REPLACE INTO profile (id, payload) VALUES (1, ?)').run(this.encodeJson(profile));
    this.appendAuditEvent({ kind: 'profile_updated', entityType: 'profile', createdAt: new Date().toISOString() });
    return profile;
  }

  getUserMap(): UserMapState {
    const row = this.db.prepare('SELECT payload FROM usermap WHERE id = 1').get() as { payload?: string } | undefined;
    return coerceUserMapState(this.decodeJson(row?.payload, EMPTY_USERMAP_STATE));
  }

  saveUserMap(tree: UserMapState): UserMapState {
    const normalized = normalizeUserMapState(tree);
    this.db.prepare('INSERT OR REPLACE INTO usermap (id, payload) VALUES (1, ?)').run(this.encodeJson(normalized));
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
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  getAgent(agentId: string): AgentSpec | null {
    const row = this.db.prepare('SELECT payload FROM agents WHERE id = ?').get(agentId) as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertAgent(agent: AgentSpec): AgentSpec {
    const existing = this.getAgent(agent.id);
    this.db.prepare('INSERT OR REPLACE INTO agents (id, payload) VALUES (?, ?)').run(agent.id, this.encodeJson(agent));
    this.appendAuditEvent({
      kind: existing ? 'agent_updated' : 'agent_created',
      entityId: agent.id,
      entityType: 'agent',
      createdAt: new Date().toISOString()
    });
    return agent;
  }

  deleteAgent(agentId: string) {
    this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
  }

  listGroups(): GroupSpec[] {
    const rows = this.db.prepare('SELECT payload FROM groups_table ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  upsertGroup(group: GroupSpec): GroupSpec {
    this.db.prepare('INSERT OR REPLACE INTO groups_table (id, payload) VALUES (?, ?)').run(group.id, this.encodeJson(group));
    return group;
  }

  deleteGroup(groupId: string) {
    this.db.prepare('DELETE FROM groups_table WHERE id = ?').run(groupId);
  }

  listChatThreads(): ChatThread[] {
    const rows = this.db.prepare('SELECT payload FROM chat_threads ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  listChatThreadsPaginated(limit: number, offset: number): ChatThread[] {
    const rows = this.db.prepare('SELECT payload FROM chat_threads ORDER BY id LIMIT ? OFFSET ?').all(limit, offset) as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  getCountChatThreads(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chat_threads').get() as { count: number };
    return row?.count ?? 0;
  }

  getChatThread(threadId: string): ChatThread | null {
    const row = this.db.prepare('SELECT payload FROM chat_threads WHERE id = ?').get(threadId) as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertChatThread(thread: ChatThread): ChatThread {
    this.db.prepare('INSERT OR REPLACE INTO chat_threads (id, payload) VALUES (?, ?)').run(thread.id, this.encodeJson(thread));
    return thread;
  }

  deleteChatThread(threadId: string) {
    this.db.prepare('DELETE FROM chat_threads WHERE id = ?').run(threadId);
  }

  listTasks(): TaskSpec[] {
    const rows = this.db.prepare('SELECT payload FROM tasks ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  listTasksPaginated(limit: number, offset: number): TaskSpec[] {
    const rows = this.db.prepare('SELECT payload FROM tasks ORDER BY id LIMIT ? OFFSET ?').all(limit, offset) as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  getCountTasks(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
    return row?.count ?? 0;
  }

  getTask(taskId: string): TaskSpec | null {
    const row = this.db.prepare('SELECT payload FROM tasks WHERE id = ?').get(taskId) as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertTask(task: TaskSpec): TaskSpec {
    this.db.prepare('INSERT OR REPLACE INTO tasks (id, payload) VALUES (?, ?)').run(task.id, this.encodeJson(task));
    return task;
  }

  deleteTask(taskId: string) {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  }

  listTaskRuns(taskId?: string): TaskRunRecord[] {
    const rows = taskId
      ? (this.db.prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY updated_at DESC, id DESC').all(taskId) as unknown as TaskRunRow[])
      : (this.db.prepare('SELECT * FROM task_runs ORDER BY updated_at DESC, id DESC').all() as unknown as TaskRunRow[]);
    return rows.map((row) => this.taskRunFromRow(row));
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
    return rows.map((row) => this.taskRunFromRow(row));
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
    return row ? this.taskRunFromRow(row) : null;
  }

  upsertTaskRun(run: TaskRunRecord): TaskRunRecord {
    const previous = this.getTaskRun(run.id);
    const columns = this.taskRunColumns(run);
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
    const kind = this.inferTaskRunAuditKind(previous?.status, run.status);
    if (kind) {
      this.appendAuditEvent({
        kind,
        entityId: run.id,
        entityType: 'task_run',
        payload: { taskId: run.taskId, status: run.status },
        createdAt: run.updatedAt
      });
    }
    return run;
  }

  private inferTaskRunAuditKind(
    previousStatus: TaskRunRecord['status'] | undefined,
    currentStatus: TaskRunRecord['status']
  ): AuditEventKind | null {
    if (currentStatus === 'running' && previousStatus !== 'running') return 'task_run_started';
    if (currentStatus === 'done') return 'task_run_completed';
    if (currentStatus === 'failed') return 'task_run_failed';
    if (currentStatus === 'cancelled') return 'task_run_cancelled';
    return null;
  }

  deleteTaskRun(runId: string) {
    this.db.prepare('DELETE FROM task_runs WHERE id = ?').run(runId);
  }

  listWorkItems(): WorkItem[] {
    const rows = this.db.prepare('SELECT payload FROM work_items').all() as Array<{ payload: string }>;
    return sortWorkItems(
      rows
        .map((row) => this.decodeJson<WorkItem | null>(row.payload, null))
        .filter((item): item is WorkItem => item !== null)
    );
  }

  listWorkItemsPaginated(limit: number, offset: number): WorkItem[] {
    return this.listWorkItems().slice(offset, offset + limit);
  }

  getCountWorkItems(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM work_items').get() as { count: number };
    return row?.count ?? 0;
  }

  getWorkItem(workItemId: string): WorkItem | null {
    const row = this.db.prepare('SELECT payload FROM work_items WHERE id = ?').get(workItemId) as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertWorkItem(item: WorkItem): WorkItem {
    this.db.prepare('INSERT OR REPLACE INTO work_items (id, payload) VALUES (?, ?)').run(item.id, this.encodeJson(item));
    return item;
  }

  deleteWorkItem(workItemId: string) {
    this.db.prepare('DELETE FROM work_items WHERE id = ?').run(workItemId);
  }

  listArtifacts(): ArtifactRecord[] {
    const rows = this.db.prepare('SELECT payload FROM artifacts ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  getArtifact(artifactId: string): ArtifactRecord | null {
    const row = this.db.prepare('SELECT payload FROM artifacts WHERE id = ?').get(artifactId) as { payload?: string } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertArtifact(artifact: ArtifactRecord): ArtifactRecord {
    this.db.prepare('INSERT OR REPLACE INTO artifacts (id, payload) VALUES (?, ?)').run(artifact.id, this.encodeJson(artifact));
    return artifact;
  }

  deleteArtifact(artifactId: string) {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(artifactId);
  }

  listMemoryFacts(visibility?: VisibilityScope): MemoryFact[] {
    const rows = this.db.prepare('SELECT payload FROM memory_facts ORDER BY id').all() as Array<{ payload: string }>;
    return rows
      .map((row) => this.decodeJson<MemoryFact>(row.payload, null as never))
      .filter((fact) => fact !== null)
      .filter((fact) => (visibility ? memoryVisibility(fact) === visibility : true));
  }

  upsertMemoryFacts(facts: MemoryFact[]): MemoryFact[] {
    const insert = this.db.prepare('INSERT OR REPLACE INTO memory_facts (id, payload) VALUES (?, ?)');
    for (const fact of facts) {
      insert.run(fact.id, this.encodeJson(fact));
    }
    return facts;
  }

  clearMemoryFacts() {
    this.db.exec('DELETE FROM memory_facts');
  }

  deleteMemoryFactsByIds(ids: string[]) {
    const del = this.db.prepare('DELETE FROM memory_facts WHERE id = ?');
    for (const id of ids) {
      del.run(id);
    }
  }

  listModels(): ProviderModelPreset[] {
    const rows = this.db.prepare('SELECT payload FROM models ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => this.decodeJson(row.payload, null as never));
  }

  updateModel(model: ProviderModelPreset): ProviderModelPreset {
    this.db.prepare('INSERT OR REPLACE INTO models (id, payload) VALUES (?, ?)').run(model.id, this.encodeJson(model));
    return model;
  }

  getProviderAuthSelection(provider: string): ProviderAuthSelection | null {
    const row = this.db.prepare('SELECT payload FROM provider_auth_state WHERE provider = ?').get(provider) as {
      payload?: string;
    } | undefined;
    return row?.payload ? this.decodeJson(row.payload, null) : null;
  }

  upsertProviderAuthSelection(selection: ProviderAuthSelection): ProviderAuthSelection {
    this.db.prepare('INSERT OR REPLACE INTO provider_auth_state (provider, payload) VALUES (?, ?)').run(
      selection.provider,
      this.encodeJson(selection)
    );
    this.appendAuditEvent({
      kind: 'provider_selection_changed',
      entityType: 'provider_auth',
      payload: { provider: selection.provider },
      createdAt: new Date().toISOString()
    });
    return selection;
  }

  getPrismProviderOverride(): PrismProviderOverrideSettings | null {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
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
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
    const next = {
      ...parsed,
      providerOverride: override ?? null
    };
    this.db.prepare('INSERT OR REPLACE INTO prism_settings (id, payload) VALUES (1, ?)').run(this.encodeJson(next));
    this.appendAuditEvent({
      kind: 'prism_override_changed',
      entityType: 'prism_settings',
      payload: override ? { provider: override.provider, modelId: override.modelId } : { cleared: true },
      createdAt: new Date().toISOString()
    });
    return override;
  }

  getAgentMode(): AgentMode {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
    const raw = parsed.agentMode;
    if (raw === 'ollama' || raw === 'bridge' || raw === 'auto') return raw;
    if (raw === 'openclaw') return 'bridge'; // migration from legacy
    return 'auto';
  }

  saveAgentMode(mode: AgentMode): AgentMode {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
    const next = {
      ...parsed,
      agentMode: mode
    };
    this.db.prepare('INSERT OR REPLACE INTO prism_settings (id, payload) VALUES (1, ?)').run(this.encodeJson(next));
    return mode;
  }

  getWorkspaceRole(): WorkspaceRole {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
    const raw = parsed.workspaceRole;
    if (raw === 'owner' || raw === 'admin' || raw === 'member' || raw === 'viewer') return raw;
    return 'owner';
  }

  saveWorkspaceRole(role: WorkspaceRole): WorkspaceRole {
    const row = this.db.prepare('SELECT payload FROM prism_settings WHERE id = 1').get() as { payload?: string } | undefined;
    const parsed = row?.payload ? this.decodeJson<Record<string, unknown>>(row.payload, {}) : {};
    const next = { ...parsed, workspaceRole: role };
    this.db.prepare('INSERT OR REPLACE INTO prism_settings (id, payload) VALUES (1, ?)').run(this.encodeJson(next));
    return role;
  }

  hasPermission(permission: Permission): boolean {
    const role = this.getWorkspaceRole();
    const allowed = ROLE_PERMISSIONS[role] ?? [];
    return allowed.includes(permission);
  }

  getVoiceConfig(): VoiceConfig {
    const row = this.db.prepare('SELECT payload FROM voice_config WHERE id = 1').get() as { payload?: string } | undefined;
    if (row?.payload) {
      return this.decodeJson<VoiceConfig>(row.payload, { enabled: false, wakeWord: 'Hey RamN', preferredVoice: 'Nova', autoListen: false, ttsProvider: 'system' });
    }
    return { enabled: false, wakeWord: 'Hey RamN', preferredVoice: 'Nova', autoListen: false, ttsProvider: 'system' };
  }

  saveVoiceConfig(config: VoiceConfig): VoiceConfig {
    this.db.prepare('INSERT OR REPLACE INTO voice_config (id, payload) VALUES (1, ?)').run(this.encodeJson(config));
    return config;
  }

  getWorkspaceSnapshot(options?: GetWorkspaceSnapshotOptions): WorkspaceSnapshot {
    const userMap = this.getUserMap();
    const { publicRoot, privateRoot } = stateRoots(userMap);
    const memoryFacts = this.listMemoryFacts();

    const useLite =
      options &&
      (options.tasksLimit !== undefined || options.workItemsLimit !== undefined || options.chatThreadsLimit !== undefined);

    const tasksLimit = options?.tasksLimit ?? 0;
    const workItemsLimit = options?.workItemsLimit ?? 0;
    const chatThreadsLimit = options?.chatThreadsLimit ?? 0;

    const chatThreads =
      useLite && chatThreadsLimit > 0
        ? this.listChatThreadsPaginated(chatThreadsLimit, 0)
        : this.listChatThreads();
    const tasks = useLite && tasksLimit > 0 ? this.listTasksPaginated(tasksLimit, 0) : this.listTasks();
    const workItems =
      useLite && workItemsLimit > 0 ? this.listWorkItemsPaginated(workItemsLimit, 0) : this.listWorkItems();

    const snapshot: WorkspaceSnapshot = {
      profile: this.getProfile(),
      agents: this.listAgents(),
      groups: this.listGroups(),
      chatThreads,
      tasks,
      taskRuns: this.listTaskRuns(),
      workItems,
      artifacts: this.listArtifacts(),
      userMap,
      publicUserMap: publicRoot,
      privateUserMap: privateRoot,
      memoryFacts,
      publicMemoryFacts: memoryFacts.filter((fact) => memoryVisibility(fact) === 'public'),
      privateMemoryFacts: memoryFacts.filter((fact) => memoryVisibility(fact) === 'private'),
      models: this.listModels()
    };

    if (useLite) {
      snapshot.counts = {
        tasks: tasksLimit > 0 ? this.getCountTasks() : snapshot.tasks.length,
        workItems: workItemsLimit > 0 ? this.getCountWorkItems() : snapshot.workItems.length,
        chatThreads: chatThreadsLimit > 0 ? this.getCountChatThreads() : snapshot.chatThreads.length
      };
    }

    return snapshot;
  }
}
