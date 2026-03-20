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

export interface WorkspaceTextEncoder {
  enabled: boolean;
  encodeText(value: string): string;
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

export function writeTextFile(filePath: string, value: string, encoder?: WorkspaceTextEncoder) {
  const encoded = encoder?.enabled ? encoder.encodeText(value) : value;
  writeFileSync(filePath, encoded, 'utf8');
}

export function writeJsonFile(filePath: string, value: unknown, encoder?: WorkspaceTextEncoder) {
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`, encoder);
}

export function writeStructuredExports(paths: WorkspacePaths, snapshot: WorkspaceSnapshot, encoder?: WorkspaceTextEncoder) {
  writeJsonFile(path.join(paths.context, 'profile.json'), snapshot.profile, encoder);
  writeJsonFile(path.join(paths.context, 'usermap-tree.json'), snapshot.userMap, encoder);
  writeJsonFile(path.join(paths.context, 'usermap-public-tree.json'), snapshot.publicUserMap, encoder);
  writeJsonFile(path.join(paths.context, 'usermap-private-tree.json'), snapshot.privateUserMap, encoder);
  writeJsonFile(path.join(paths.context, 'memory-facts.json'), snapshot.memoryFacts, encoder);
  writeJsonFile(path.join(paths.context, 'memory-public-facts.json'), snapshot.publicMemoryFacts, encoder);
  writeJsonFile(path.join(paths.context, 'memory-private-facts.json'), snapshot.privateMemoryFacts, encoder);
  writeJsonFile(path.join(paths.context, 'models.json'), snapshot.models, encoder);
  writeJsonFile(path.join(paths.agents, 'index.json'), snapshot.agents, encoder);
  writeJsonFile(path.join(paths.work, 'chat-threads.json'), snapshot.chatThreads, encoder);
  writeJsonFile(path.join(paths.tasks, 'index.json'), snapshot.tasks, encoder);
  writeJsonFile(path.join(paths.tasks, 'task-runs.json'), snapshot.taskRuns, encoder);
  writeJsonFile(path.join(paths.work, 'work-items.json'), snapshot.workItems, encoder);
  writeJsonFile(path.join(paths.work, 'artifacts.json'), snapshot.artifacts, encoder);

  for (const agent of snapshot.agents) {
    writeJsonFile(path.join(paths.agents, `${agent.slug}.json`), agent, encoder);
  }

  for (const task of snapshot.tasks) {
    writeJsonFile(path.join(paths.tasks, `${task.id}.json`), task, encoder);
  }
}

export async function syncRuntimeWorkspace(
  paths: WorkspacePaths,
  snapshot: WorkspaceSnapshot,
  runtimeWorkspace: RuntimeWorkspaceManager,
  options?: { disableMirror?: boolean | undefined }
) {
  if (options?.disableMirror) {
    return;
  }

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

export function syncStructuredExports(
  paths: WorkspacePaths,
  snapshot: WorkspaceSnapshot,
  runtimeWorkspace: RuntimeWorkspaceManager,
  options?: { encoder?: WorkspaceTextEncoder | undefined; disableRuntimeWorkspaceMirror?: boolean | undefined }
) {
  writeStructuredExports(paths, snapshot, options?.encoder);
  void syncRuntimeWorkspace(paths, snapshot, runtimeWorkspace, {
    disableMirror: options?.disableRuntimeWorkspaceMirror
  }).catch((error) => {
    console.warn('[runtime-workspace] sync failed:', error);
  });
}
