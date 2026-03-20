import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EXTERNAL_WORKSPACE_MANIFEST_FILENAME,
  type RuntimeStatus,
  type RuntimeWorkspaceManager
} from '@supreme/runtime';
import type { WorkspaceSnapshot } from '@supreme/storage';
import type {
  OllamaRuntimeStatus,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderAuthSelection,
  ProviderId
} from '@supreme/shared';
import type { WorkspacePaths, WorkspaceTextEncoder } from './workspace-sync.js';

type ExportKind = 'backup-export' | 'support-bundle';

export interface LocalBundleMetadata {
  outputPath: string;
  createdAt: string;
  includedItems: string[];
}

interface LocalBundleContext {
  workspacePaths: WorkspacePaths;
  snapshot: WorkspaceSnapshot;
  providerProfiles: ProviderAuthProfile[];
  providerSelections: ProviderAuthSelection[];
  prismOverride: PrismProviderOverrideSettings | null;
  runtimeStatus: RuntimeStatus;
  ollamaStatus: OllamaRuntimeStatus;
  health?: {
    ollama: { ready: boolean; available: boolean };
    runtimeBridge: { ready: boolean; version: string | null };
    storage: { ok: boolean };
    scheduler: { ok: boolean };
  };
  auditLogJson?: string;
  schemaVersion: number;
  databasePath: string;
  userDataPath: string;
  mainProcessLogPath: string;
  repoRoot: string;
  runtimeWorkspace: RuntimeWorkspaceManager;
  appInfo: {
    name: string;
    version: string;
    isPackaged: boolean;
    platform: NodeJS.Platform;
    arch: string;
    processVersions: NodeJS.ProcessVersions;
  };
  textEncoder?: WorkspaceTextEncoder;
}

interface PackageInfo {
  rootPackage: Record<string, unknown> | null;
  desktopPackage: Record<string, unknown> | null;
}

interface FileStatSummary {
  exists: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
}

const REDACTED = '[REDACTED]';
const SECRET_KEY_PATTERN = /^(api[_-]?key|token|secret|password|authorization|access[_-]?token|refresh[_-]?token)$/i;
const SECRET_TEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9]{16,}\b/g, '[REDACTED_OPENAI_KEY]'],
  [/\bAIza[0-9A-Za-z\-_]{20,}\b/g, '[REDACTED_GOOGLE_KEY]'],
  [/\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi, 'Bearer [REDACTED]'],
  [/((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?)[^"',\s}]+/gi, `$1${REDACTED}`]
];
const ALL_PROVIDER_IDS: ProviderId[] = ['ollama', 'openai', 'anthropic', 'google'];

function makeStamp(createdAt: string) {
  return createdAt.replace(/[:.]/g, '-');
}

function sanitizeText(value: string): string {
  let sanitized = value;
  for (const [pattern, replacement] of SECRET_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      next[key] = entry == null ? entry : REDACTED;
      continue;
    }

    next[key] = sanitizeUnknown(entry);
  }

  return next;
}

async function writeTextFile(filePath: string, content: string, encoder?: WorkspaceTextEncoder) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, encoder?.enabled ? encoder.encodeText(content) : content, 'utf8');
}

async function writeJsonFile(filePath: string, value: unknown, encoder?: WorkspaceTextEncoder) {
  await writeTextFile(filePath, `${JSON.stringify(sanitizeUnknown(value), null, 2)}\n`, encoder);
}

async function readJsonFileOptional(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function statOptional(filePath: string): Promise<FileStatSummary> {
  try {
    const info = await stat(filePath);
    return {
      exists: true,
      sizeBytes: info.size,
      modifiedAt: info.mtime.toISOString()
    };
  } catch {
    return { exists: false };
  }
}

async function copySanitizedTextFile(sourcePath: string, destinationPath: string, encoder?: WorkspaceTextEncoder): Promise<boolean> {
  try {
    const content = await readFile(sourcePath, 'utf8');
    await writeTextFile(destinationPath, sanitizeText(content), encoder);
    return true;
  } catch {
    return false;
  }
}

async function copySanitizedDirectory(
  sourceDir: string,
  destinationDir: string,
  copiedFiles: string[],
  rootDir: string,
  encoder?: WorkspaceTextEncoder
) {
  try {
    const entries = await readdir(sourceDir, { encoding: 'utf8', withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const destinationPath = path.join(destinationDir, entry.name);

      if (entry.isDirectory()) {
        await copySanitizedDirectory(sourcePath, destinationPath, copiedFiles, rootDir, encoder);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (await copySanitizedTextFile(sourcePath, destinationPath, encoder)) {
        copiedFiles.push(path.relative(rootDir, destinationPath));
      }
    }
  } catch {
    return;
  }
}

function sanitizeProviderProfiles(profiles: ProviderAuthProfile[]) {
  return profiles.map((profile) => ({
    id: profile.id,
    provider: profile.provider,
    label: profile.label,
    ...(profile.description ? { description: profile.description } : {}),
    isDefault: profile.isDefault ?? false,
    hasKeyRef: Boolean(profile.keyRef),
    hasTokenRef: Boolean(profile.tokenRef),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  }));
}

function makeCounts(snapshot: WorkspaceSnapshot, providerProfiles: ProviderAuthProfile[]) {
  return {
    agents: snapshot.agents.length,
    groups: snapshot.groups.length,
    chatThreads: snapshot.chatThreads.length,
    tasks: snapshot.tasks.length,
    taskRuns: snapshot.taskRuns.length,
    workItems: snapshot.workItems.length,
    artifacts: snapshot.artifacts.length,
    models: snapshot.models.length,
    memoryFacts: snapshot.memoryFacts.length,
    publicMemoryFacts: snapshot.publicMemoryFacts.length,
    privateMemoryFacts: snapshot.privateMemoryFacts.length,
    providerProfiles: providerProfiles.length
  };
}

function makeProviderSelectionSnapshot(selections: ProviderAuthSelection[]) {
  const byProvider = new Map(selections.map((selection) => [selection.provider, selection]));
  return ALL_PROVIDER_IDS.map((provider) => byProvider.get(provider) ?? { provider, profileId: null });
}

async function readPackageInfo(repoRoot: string): Promise<PackageInfo> {
  return {
    rootPackage: await readJsonFileOptional(path.join(repoRoot, 'package.json')),
    desktopPackage: await readJsonFileOptional(path.join(repoRoot, 'apps', 'desktop', 'package.json'))
  };
}

async function writeStructuredSnapshot(
  rootDir: string,
  snapshot: WorkspaceSnapshot,
  providerProfiles: ProviderAuthProfile[],
  providerSelections: ProviderAuthSelection[],
  prismOverride: PrismProviderOverrideSettings | null,
  encoder?: WorkspaceTextEncoder
) {
  const structuredDir = path.join(rootDir, 'structured');
  await writeJsonFile(path.join(structuredDir, 'profile.json'), snapshot.profile, encoder);
  await writeJsonFile(path.join(structuredDir, 'agents.json'), snapshot.agents, encoder);
  await writeJsonFile(path.join(structuredDir, 'groups.json'), snapshot.groups, encoder);
  await writeJsonFile(path.join(structuredDir, 'chat-threads.json'), snapshot.chatThreads, encoder);
  await writeJsonFile(path.join(structuredDir, 'tasks.json'), snapshot.tasks, encoder);
  await writeJsonFile(path.join(structuredDir, 'task-runs.json'), snapshot.taskRuns, encoder);
  await writeJsonFile(path.join(structuredDir, 'work-items.json'), snapshot.workItems, encoder);
  await writeJsonFile(path.join(structuredDir, 'artifacts.json'), snapshot.artifacts, encoder);
  await writeJsonFile(path.join(structuredDir, 'user-map-state.json'), snapshot.userMap, encoder);
  await writeJsonFile(path.join(structuredDir, 'public-user-map.json'), snapshot.publicUserMap, encoder);
  await writeJsonFile(path.join(structuredDir, 'private-user-map.json'), snapshot.privateUserMap, encoder);
  await writeJsonFile(path.join(structuredDir, 'memory-facts.json'), snapshot.memoryFacts, encoder);
  await writeJsonFile(path.join(structuredDir, 'public-memory-facts.json'), snapshot.publicMemoryFacts, encoder);
  await writeJsonFile(path.join(structuredDir, 'private-memory-facts.json'), snapshot.privateMemoryFacts, encoder);
  await writeJsonFile(path.join(structuredDir, 'models.json'), snapshot.models, encoder);
  await writeJsonFile(path.join(structuredDir, 'provider-profiles.json'), sanitizeProviderProfiles(providerProfiles), encoder);
  await writeJsonFile(path.join(structuredDir, 'provider-selections.json'), makeProviderSelectionSnapshot(providerSelections), encoder);
  await writeJsonFile(path.join(structuredDir, 'prism-provider-override.json'), prismOverride, encoder);
}

async function writeRuntimeWorkspaceExport(
  destinationRoot: string,
  snapshot: WorkspaceSnapshot,
  runtimeWorkspace: RuntimeWorkspaceManager,
  encoder?: WorkspaceTextEncoder
) {
  const plan = runtimeWorkspace.buildPlan({
    profile: snapshot.profile,
    userMap: snapshot.userMap,
    agents: snapshot.agents,
    groups: snapshot.groups,
    memoryFacts: snapshot.memoryFacts,
    publicMemoryFacts: snapshot.publicMemoryFacts,
    privateMemoryFacts: snapshot.privateMemoryFacts
  });
  const runtimeRoot = path.join(destinationRoot, plan.rootDir);

  for (const file of plan.files) {
    await writeTextFile(path.join(runtimeRoot, file.path), sanitizeText(file.content), encoder);
  }

  const manifestContent = `${JSON.stringify(sanitizeUnknown(plan.manifest), null, 2)}\n`;
  await writeTextFile(path.join(runtimeRoot, 'runtime.workspace.json'), manifestContent, encoder);
  await writeTextFile(path.join(runtimeRoot, EXTERNAL_WORKSPACE_MANIFEST_FILENAME), manifestContent, encoder);

  return {
    relativeRoot: path.relative(destinationRoot, runtimeRoot),
    manifestPath: path.relative(destinationRoot, path.join(runtimeRoot, 'runtime.workspace.json'))
  };
}

async function writeArtifactInventory(
  rootDir: string,
  snapshot: WorkspaceSnapshot,
  workspacePaths: WorkspacePaths,
  encoder?: WorkspaceTextEncoder
) {
  const items = await Promise.all(snapshot.artifacts.map(async (artifact) => {
    const absolutePath = path.join(workspacePaths.root, artifact.relativePath);
    const file = await statOptional(absolutePath);
    return {
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      relativePath: artifact.relativePath,
      taskId: artifact.taskId ?? null,
      workItemId: artifact.workItemId,
      createdAt: artifact.createdAt,
      file,
      included: false,
      omittedReason: 'Artifact file payloads are omitted from desktop exports for safety.'
    };
  }));

  await writeJsonFile(path.join(rootDir, 'artifacts', 'manifest.json'), {
    copiedFiles: [],
    items
  }, encoder);
}

async function writePackageDiagnostics(rootDir: string, repoRoot: string, appInfo: LocalBundleContext['appInfo'], encoder?: WorkspaceTextEncoder) {
  const packageInfo = await readPackageInfo(repoRoot);
  await writeJsonFile(path.join(rootDir, 'diagnostics', 'package-info.json'), {
    app: {
      name: appInfo.name,
      version: appInfo.version,
      isPackaged: appInfo.isPackaged
    },
    environment: {
      platform: appInfo.platform,
      arch: appInfo.arch,
      processVersions: appInfo.processVersions
    },
    rootPackage: packageInfo.rootPackage
      ? {
          name: packageInfo.rootPackage.name,
          version: packageInfo.rootPackage.version,
          workspaces: packageInfo.rootPackage.workspaces,
          scripts: packageInfo.rootPackage.scripts
        }
      : null,
    desktopPackage: packageInfo.desktopPackage
      ? {
          name: packageInfo.desktopPackage.name,
          version: packageInfo.desktopPackage.version,
          description: packageInfo.desktopPackage.description,
          build: packageInfo.desktopPackage.build
        }
      : null
  }, encoder);
}

async function writeSupportDiagnostics(rootDir: string, context: LocalBundleContext, runtimeWorkspaceRoot: string) {
  const counts = makeCounts(context.snapshot, context.providerProfiles);
  const providerProfiles = sanitizeProviderProfiles(context.providerProfiles);
  const selections = makeProviderSelectionSnapshot(context.providerSelections);
  const [dbFile, walFile, shmFile] = await Promise.all([
    statOptional(context.databasePath),
    statOptional(`${context.databasePath}-wal`),
    statOptional(`${context.databasePath}-shm`)
  ]);

  await writeJsonFile(path.join(rootDir, 'diagnostics', 'summary.json'), {
    createdAt: new Date().toISOString(),
    schemaVersion: context.schemaVersion,
    runtime: context.runtimeStatus,
    ollama: context.ollamaStatus,
    health: context.health,
    counts,
    paths: {
      userDataPath: context.userDataPath,
      workspaceRoot: context.workspacePaths.root,
      runtimeWorkspaceRoot
    },
    databaseFiles: {
      main: dbFile,
      wal: walFile,
      shm: shmFile
    },
    redactionPolicy: {
      secretStoresIncluded: false,
      artifactPayloadsIncluded: false,
      stringRedaction: 'pattern-based'
    }
  }, context.textEncoder);
  await writeJsonFile(path.join(rootDir, 'diagnostics', 'provider-profiles.json'), providerProfiles, context.textEncoder);
  await writeJsonFile(path.join(rootDir, 'diagnostics', 'provider-state.json'), {
    selections,
    prismOverride: context.prismOverride
  }, context.textEncoder);
  await writeJsonFile(path.join(rootDir, 'diagnostics', 'runtime-status.json'), {
    runtime: context.runtimeStatus,
    ollama: context.ollamaStatus
  }, context.textEncoder);
  if (context.auditLogJson) {
    await writeTextFile(path.join(rootDir, 'diagnostics', 'audit-log.json'), context.auditLogJson, context.textEncoder);
  }
}

async function writeSupportLogs(
  rootDir: string,
  workspacePaths: WorkspacePaths,
  mainProcessLogPath: string,
  encoder?: WorkspaceTextEncoder
) {
  const copiedFiles: string[] = [];
  const userDataLogPath = path.join(rootDir, 'logs', 'user-data', 'main-process.log');

  if (await copySanitizedTextFile(mainProcessLogPath, userDataLogPath, encoder)) {
    copiedFiles.push(path.relative(rootDir, userDataLogPath));
  }

  await copySanitizedDirectory(workspacePaths.logs, path.join(rootDir, 'logs', 'workspace'), copiedFiles, rootDir, encoder);
  return copiedFiles;
}

async function writeManifest(
  rootDir: string,
  input: {
    kind: ExportKind;
    createdAt: string;
    includedItems: string[];
    counts: ReturnType<typeof makeCounts>;
    runtimeWorkspaceRoot: string;
  },
  encoder?: WorkspaceTextEncoder
) {
  await writeJsonFile(path.join(rootDir, 'manifest.json'), {
    kind: input.kind,
    createdAt: input.createdAt,
    outputPath: rootDir,
    includedItems: input.includedItems,
    counts: input.counts,
    runtimeWorkspaceRoot: input.runtimeWorkspaceRoot,
    omittedItems: [
      'Raw SQLite database files',
      'Encrypted provider secret stores',
      'Compatibility secret mirrors',
      'Artifact file payloads'
    ]
  }, encoder);
}

async function buildBundle(kind: ExportKind, context: LocalBundleContext): Promise<LocalBundleMetadata> {
  const createdAt = new Date().toISOString();
  const bundleRoot = path.join(
    context.workspacePaths.root,
    'exports',
    kind === 'backup-export' ? 'backups' : 'support-bundles',
    makeStamp(createdAt)
  );

  await mkdir(bundleRoot, { recursive: true });
  await writeStructuredSnapshot(
    bundleRoot,
    context.snapshot,
    context.providerProfiles,
    context.providerSelections,
    context.prismOverride,
    context.textEncoder
  );

  const runtimeWorkspace = await writeRuntimeWorkspaceExport(
    path.join(bundleRoot, 'runtime-workspace'),
    context.snapshot,
    context.runtimeWorkspace,
    context.textEncoder
  );
  const runtimeWorkspaceRoot = path.join('runtime-workspace', runtimeWorkspace.relativeRoot);
  await writeArtifactInventory(bundleRoot, context.snapshot, context.workspacePaths, context.textEncoder);

  const includedItems = ['manifest.json', 'structured', 'runtime-workspace', 'artifacts'];

  if (kind === 'support-bundle') {
    await writeSupportDiagnostics(bundleRoot, context, runtimeWorkspaceRoot);
    await writePackageDiagnostics(bundleRoot, context.repoRoot, context.appInfo, context.textEncoder);
    await writeSupportLogs(bundleRoot, context.workspacePaths, context.mainProcessLogPath, context.textEncoder);
    includedItems.splice(1, 0, 'diagnostics', 'logs');
  }

  await writeManifest(bundleRoot, {
    kind,
    createdAt,
    includedItems,
    counts: makeCounts(context.snapshot, context.providerProfiles),
    runtimeWorkspaceRoot
  }, context.textEncoder);

  return {
    outputPath: bundleRoot,
    createdAt,
    includedItems
  };
}

export async function createBackupExport(context: LocalBundleContext): Promise<LocalBundleMetadata> {
  return buildBundle('backup-export', context);
}

export async function createSupportBundle(context: LocalBundleContext): Promise<LocalBundleMetadata> {
  return buildBundle('support-bundle', context);
}
