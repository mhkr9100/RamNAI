import { DatabaseSync } from 'node:sqlite';
import {
  AgentSpec,
  ArtifactRecord,
  DEFAULT_MODEL_PRESETS,
  EMPTY_USERMAP_TREE,
  GroupSpec,
  LocalProfile,
  MemoryFact,
  ProviderModelPreset,
  TaskSpec,
  UserMapNode,
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
  tasks: TaskSpec[];
  workItems: WorkItem[];
  artifacts: ArtifactRecord[];
  userMap: UserMapNode;
  memoryFacts: MemoryFact[];
  models: ProviderModelPreset[];
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
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
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
      this.db.prepare('INSERT INTO usermap (id, payload) VALUES (1, ?)').run(JSON.stringify(EMPTY_USERMAP_TREE));
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

  getUserMap(): UserMapNode {
    const row = this.db.prepare('SELECT payload FROM usermap WHERE id = 1').get() as { payload?: string } | undefined;
    return parseJson(row?.payload, EMPTY_USERMAP_TREE);
  }

  saveUserMap(tree: UserMapNode): UserMapNode {
    this.db.prepare('INSERT OR REPLACE INTO usermap (id, payload) VALUES (1, ?)').run(JSON.stringify(tree));
    return tree;
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

  listWorkItems(): WorkItem[] {
    const rows = this.db.prepare('SELECT payload FROM work_items ORDER BY updatedAt DESC, id DESC').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
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

  listMemoryFacts(): MemoryFact[] {
    const rows = this.db.prepare('SELECT payload FROM memory_facts ORDER BY id').all() as Array<{ payload: string }>;
    return rows.map((row) => parseJson(row.payload, null as never));
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

  getWorkspaceSnapshot(): WorkspaceSnapshot {
    return {
      profile: this.getProfile(),
      agents: this.listAgents(),
      groups: this.listGroups(),
      tasks: this.listTasks(),
      workItems: this.listWorkItems(),
      artifacts: this.listArtifacts(),
      userMap: this.getUserMap(),
      memoryFacts: this.listMemoryFacts(),
      models: this.listModels()
    };
  }
}
