import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkspaceSnapshot } from '@supreme/storage';
import type { RuntimeWorkspaceManager } from '@supreme/runtime';

export interface WorkspacePaths {
  root: string;
  artifacts: string;
  context: string;
  agents: string;
  tasks: string;
  work: string;
  logs: string;
}

export function buildWorkspacePaths(root: string): WorkspacePaths {
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
  return paths;
}

export function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeStructuredExports(paths: WorkspacePaths, snapshot: WorkspaceSnapshot) {
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
}

export async function syncRuntimeWorkspace(paths: WorkspacePaths, snapshot: WorkspaceSnapshot, runtimeWorkspace: RuntimeWorkspaceManager) {
  return runtimeWorkspace.sync(paths.root, {
    profile: snapshot.profile,
    userMap: snapshot.userMap,
    agents: snapshot.agents,
    groups: snapshot.groups,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts
  });
}

export function syncStructuredExports(paths: WorkspacePaths, snapshot: WorkspaceSnapshot, runtimeWorkspace: RuntimeWorkspaceManager) {
  writeStructuredExports(paths, snapshot);
  void syncRuntimeWorkspace(paths, snapshot, runtimeWorkspace).catch((error) => {
    console.warn('[runtime-workspace] sync failed:', error);
  });
}
