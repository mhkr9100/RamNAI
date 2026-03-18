import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const requiredBuildOutputs = [
  path.join(repoRoot, 'packages/shared/dist/index.js'),
  path.join(repoRoot, 'packages/storage/dist/index.js'),
  path.join(repoRoot, 'packages/runtime/dist/index.js'),
  path.join(repoRoot, 'apps/desktop/dist/task-scheduling.js'),
  path.join(repoRoot, 'apps/desktop/dist/scheduler-recovery.js'),
  path.join(repoRoot, 'apps/desktop/dist/task-run-heartbeat.js'),
  path.join(repoRoot, 'apps/desktop/dist/workspace-sync.js')
];

for (const filePath of requiredBuildOutputs) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Built artifact missing: ${filePath}. Run npm run build first.`);
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'supreme-runtime-smoke-'));
const tempHome = path.join(tempRoot, 'home');
await mkdir(tempHome, { recursive: true });
process.env.HOME = tempHome;
process.env.USERPROFILE = tempHome;

const [
  sharedModule,
  { SqliteStorage },
  runtimeModule,
  taskSchedulingModule,
  schedulerRecoveryModule,
  taskRunHeartbeatModule,
  workspaceSyncModule
] = await Promise.all([
  import(pathToFileURL(path.join(repoRoot, 'packages/shared/dist/index.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'packages/storage/dist/index.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'packages/runtime/dist/index.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'apps/desktop/dist/task-scheduling.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'apps/desktop/dist/scheduler-recovery.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'apps/desktop/dist/task-run-heartbeat.js')).href),
  import(pathToFileURL(path.join(repoRoot, 'apps/desktop/dist/workspace-sync.js')).href)
]);

const { EMPTY_USERMAP_STATE, DEFAULT_MODEL_PRESETS } = sharedModule;
const { ProviderAuthStore, RuntimeWorkspaceManager } = runtimeModule;
const { buildTaskSpec } = taskSchedulingModule;
const { recoverInterruptedWork } = schedulerRecoveryModule;
const { startTaskRunHeartbeat } = taskRunHeartbeatModule;
const { buildWorkspacePaths, writeStructuredExports, syncRuntimeWorkspace } = workspaceSyncModule;

function createSmokeCipher() {
  const key = createHash('sha256').update(`smoke:${tempHome}`).digest();

  return {
    id: 'smoke-aes-256-gcm',
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    },
    decrypt(value) {
      const payload = Buffer.from(value, 'base64');
      const iv = payload.subarray(0, 12);
      const authTag = payload.subarray(12, 28);
      const encrypted = payload.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const checks = [];

async function runCheck(name, fn) {
  await fn();
  checks.push(name);
  console.log(`PASS ${name}`);
}

const dbPath = path.join(tempRoot, 'supreme-raman-ai.sqlite');
const workspacePaths = buildWorkspacePaths(path.join(tempRoot, 'workspace'));
const storage = new SqliteStorage(dbPath);
storage.init();

try {
  await runCheck('sqlite init and profile persistence', async () => {
    const profile = { name: 'Smoke Runner', email: 'smoke@local.test' };
    storage.saveProfile(profile);
    assert.deepEqual(storage.getProfile(), profile);
  });

  await runCheck('provider auth metadata, encrypted secret storage, and compatibility export', async () => {
    const authStore = new ProviderAuthStore(createSmokeCipher());
    const profileId = `smoke-openai-${randomUUID()}`;
    const apiKey = `smoke-key-${randomUUID()}`;
    const token = `smoke-token-${randomUUID()}`;

    const savedProfile = await authStore.upsertProfile({
      id: profileId,
      provider: 'openai',
      label: 'Smoke Provider',
      description: 'runtime smoke',
      apiKey,
      token,
      isDefault: true
    });

    assert.equal(savedProfile.provider, 'openai');
    assert.ok(savedProfile.keyRef?.id);
    assert.ok(savedProfile.tokenRef?.id);

    const appProfilesPath = path.join(tempHome, '.supreme-raman-ai', 'runtime-auth', 'auth-profiles.json');
    const encryptedSecretsPath = path.join(tempHome, '.supreme-raman-ai', 'runtime-auth', 'secrets.enc.json');
    const compatProfilesPath = path.join(tempHome, '.openclaw', 'auth-profiles.json');
    const compatSecretsPath = path.join(tempHome, '.openclaw', 'secrets.json');

    const appProfilesText = await readFile(appProfilesPath, 'utf8');
    let encryptedSecretsText = null;
    try {
      encryptedSecretsText = await readFile(encryptedSecretsPath, 'utf8');
    } catch {
      encryptedSecretsText = null;
    }

    assert.ok(appProfilesText.includes(profileId));
    assert.ok(!appProfilesText.includes(apiKey));
    assert.ok(!appProfilesText.includes(token));
    if (encryptedSecretsText !== null) {
      assert.ok(!encryptedSecretsText.includes(apiKey));
      assert.ok(!encryptedSecretsText.includes(token));
    }

    const validation = await authStore.testProfile({
      provider: 'openai',
      profileId,
      probeWithRuntime: false
    });
    assert.equal(validation.ok, true);

    await authStore.withRuntimeBridgeCompatibility(async () => {
      const compatProfilesText = await readFile(compatProfilesPath, 'utf8');
      const compatSecretsText = await readFile(compatSecretsPath, 'utf8');
      assert.ok(compatProfilesText.includes(profileId));
      assert.ok(!compatProfilesText.includes(apiKey));
      assert.ok(!compatProfilesText.includes(token));
      assert.ok(compatSecretsText.includes('"openai"'));
      assert.ok(compatSecretsText.includes(apiKey));
      assert.ok(compatSecretsText.includes(token));
    });

    let compatProfilesExists = true;
    let compatSecretsExists = true;
    try {
      await access(compatProfilesPath);
    } catch {
      compatProfilesExists = false;
    }
    try {
      await access(compatSecretsPath);
    } catch {
      compatSecretsExists = false;
    }
    assert.equal(compatProfilesExists, false);
    assert.equal(compatSecretsExists, false);

    const profilesBeforeDelete = await authStore.listProfiles();
    assert.ok(profilesBeforeDelete.some((p) => p.id === profileId));

    // Simulate active selection lifecycle (desktop main clears SQLite selection on delete).
    storage.upsertProviderAuthSelection({ provider: 'openai', profileId });
    assert.deepEqual(storage.getProviderAuthSelection('openai'), { provider: 'openai', profileId });

    await authStore.deleteProfile('openai', profileId);

    const profilesAfterDelete = await authStore.listProfiles();
    assert.ok(!profilesAfterDelete.some((p) => p.id === profileId));

    const validationAfterDelete = await authStore.testProfile({
      provider: 'openai',
      profileId,
      probeWithRuntime: false
    });
    assert.equal(validationAfterDelete.ok, false);

    await authStore.withRuntimeBridgeCompatibility(async () => {
      const compatProfilesText = await readFile(compatProfilesPath, 'utf8');
      const compatSecretsText = await readFile(compatSecretsPath, 'utf8');
      assert.ok(!compatProfilesText.includes(profileId));
      assert.ok(!compatSecretsText.includes(apiKey));
      assert.ok(!compatSecretsText.includes(token));
    });

    let compatProfilesExistsAfterDelete = true;
    let compatSecretsExistsAfterDelete = true;
    try {
      await access(compatProfilesPath);
    } catch {
      compatProfilesExistsAfterDelete = false;
    }
    try {
      await access(compatSecretsPath);
    } catch {
      compatSecretsExistsAfterDelete = false;
    }
    assert.equal(compatProfilesExistsAfterDelete, false);
    assert.equal(compatSecretsExistsAfterDelete, false);

    const selection = storage.getProviderAuthSelection('openai');
    if (selection?.profileId === profileId) {
      storage.upsertProviderAuthSelection({ provider: 'openai', profileId: null });
    }
    assert.deepEqual(storage.getProviderAuthSelection('openai'), { provider: 'openai', profileId: null });

    const dbText = (await readFile(dbPath)).toString('utf8');
    assert.ok(!dbText.includes(apiKey));
    assert.ok(!dbText.includes(token));
  });

  await runCheck('task run heartbeat renews lease', async () => {
    const taskId = 'task-hb';
    const runId = 'run-hb';
    const claimToken = 'claim-hb';
    const initialUpdatedAt = new Date('2026-03-18T12:00:00.000Z').toISOString();
    const expiredLease = new Date('2026-03-18T11:59:00.000Z').toISOString();

    storage.upsertTaskRun({
      id: runId,
      taskId,
      status: 'running',
      claimToken,
      leaseExpiresAt: expiredLease,
      updatedAt: initialUpdatedAt,
      createdAt: initialUpdatedAt,
      startedAt: initialUpdatedAt,
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1
    });

    const controller = startTaskRunHeartbeat({
      storage,
      runId,
      claimToken,
      leaseMs: 2000,
      intervalMs: 100,
      hardTimeoutMs: 2000
    });

    await new Promise((resolve) => setTimeout(resolve, 350));

    const refreshed = storage.getTaskRun(runId);
    assert.ok(refreshed && refreshed.leaseExpiresAt);
    assert.ok(Date.parse(refreshed.leaseExpiresAt) > Date.parse(expiredLease));

    controller.stop();
  });

  await runCheck('restart recovery honors task run lease', async () => {
    const timezone = 'America/Chicago';
    const installedModelIds = DEFAULT_MODEL_PRESETS.map((model) => model.id);
    const now = new Date('2026-03-18T12:00:00.000Z');
    const nowIso = now.toISOString();

    const futureLease = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const pastLease = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const recurringActive = buildTaskSpec({
      title: 'Recurring Active',
      objective: 'Should not recover while lease active',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'simple', preset: 'daily', time: '09:15' }
    }, { now, timezone, installedModelIds, taskId: 'task-rec-active' });

    const recurringExpired = buildTaskSpec({
      title: 'Recurring Expired',
      objective: 'Should recover immediately',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'simple', preset: 'daily', time: '09:15' }
    }, { now, timezone, installedModelIds, taskId: 'task-rec-expired' });

    const onceExpired = buildTaskSpec({
      title: 'Once Expired',
      objective: 'Once task should fail on expired lease',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'once', runAtLocal: '2026-03-18 09:30' }
    }, { now, timezone, installedModelIds, taskId: 'task-once-expired' });

    const makeRunning = (task) => ({
      ...task,
      status: 'running',
      startedAt: nowIso,
      updatedAt: nowIso,
      runCount: 3,
      artifactIds: [],
      nextRunAt: task.nextRunAt ?? nowIso
    });

    storage.upsertTask(makeRunning(recurringActive));
    storage.upsertTask(makeRunning(recurringExpired));
    storage.upsertTask(makeRunning(onceExpired));

    const workItem = (id, taskId, title) => ({
      id,
      type: 'task',
      title,
      status: 'running',
      sourceTaskId: taskId,
      createdAt: nowIso,
      updatedAt: nowIso,
      artifactIds: []
    });

    storage.upsertWorkItem(workItem('work-rec-active', recurringActive.id, recurringActive.title));
    storage.upsertWorkItem(workItem('work-rec-expired', recurringExpired.id, recurringExpired.title));
    storage.upsertWorkItem(workItem('work-once-expired', onceExpired.id, onceExpired.title));

    storage.upsertTaskRun({
      id: 'run-rec-active',
      taskId: recurringActive.id,
      status: 'running',
      claimToken: 'claim-rec-active',
      leaseExpiresAt: futureLease,
      updatedAt: nowIso,
      createdAt: nowIso,
      startedAt: nowIso,
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1,
      target: { type: 'prism' }
    });
    storage.upsertTaskRun({
      id: 'run-rec-expired',
      taskId: recurringExpired.id,
      status: 'running',
      claimToken: 'claim-rec-expired',
      leaseExpiresAt: pastLease,
      updatedAt: nowIso,
      createdAt: nowIso,
      startedAt: nowIso,
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1,
      target: { type: 'prism' }
    });
    storage.upsertTaskRun({
      id: 'run-once-expired',
      taskId: onceExpired.id,
      status: 'running',
      claimToken: 'claim-once-expired',
      leaseExpiresAt: pastLease,
      updatedAt: nowIso,
      createdAt: nowIso,
      startedAt: nowIso,
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1,
      target: { type: 'prism' }
    });

    recoverInterruptedWork(storage, now);

    const recActiveAfter = storage.getTask(recurringActive.id);
    assert.ok(recActiveAfter);
    assert.equal(recActiveAfter.status, 'running');
    assert.equal(recActiveAfter.runCount, 3);

    const recExpiredAfter = storage.getTask(recurringExpired.id);
    assert.ok(recExpiredAfter);
    assert.equal(recExpiredAfter.status, 'queued');
    assert.equal(recExpiredAfter.nextRunAt, nowIso);
    assert.equal(recExpiredAfter.runCount, 4);

    const onceExpiredAfter = storage.getTask(onceExpired.id);
    assert.ok(onceExpiredAfter);
    assert.equal(onceExpiredAfter.status, 'failed');
    assert.equal(onceExpiredAfter.runCount, 4);

    const recExpiredRuns = storage.listTaskRuns(recurringExpired.id);
    assert.ok(recExpiredRuns.every((run) => run.status === 'failed'));

    const onceExpiredRuns = storage.listTaskRuns(onceExpired.id);
    assert.ok(onceExpiredRuns.every((run) => run.status === 'failed'));

    const workItems = storage.listWorkItems();
    const recExpiredWork = workItems.find((w) => w.id === 'work-rec-expired');
    assert.ok(recExpiredWork);
    assert.equal(recExpiredWork.status, 'failed');
    const onceExpiredWork = workItems.find((w) => w.id === 'work-once-expired');
    assert.ok(onceExpiredWork);
    assert.equal(onceExpiredWork.status, 'failed');
  });

  await runCheck('task rerun cancels active task runs', async () => {
    const timezone = 'America/Chicago';
    const installedModelIds = DEFAULT_MODEL_PRESETS.map((model) => model.id);
    const nowIso = new Date('2026-03-18T12:00:00.000Z').toISOString();
    const futureLease = new Date('2026-03-18T12:05:00.000Z').toISOString();

    const task = buildTaskSpec({
      title: 'Rerun Task',
      objective: 'Rerun should cancel active lease holders',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'simple', preset: 'daily', time: '09:15' }
    }, { now: new Date(nowIso), timezone, installedModelIds, taskId: 'task-rerun' });

    const runningTask = {
      ...task,
      status: 'running',
      startedAt: nowIso,
      updatedAt: nowIso,
      runCount: 2,
      artifactIds: [],
      nextRunAt: nowIso
    };

    storage.upsertTask(runningTask);

    const claimToken = 'claim-rerun';
    storage.upsertTaskRun({
      id: 'run-rerun',
      taskId: task.id,
      status: 'running',
      claimToken,
      leaseExpiresAt: futureLease,
      updatedAt: nowIso,
      createdAt: nowIso,
      startedAt: nowIso,
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1,
      target: { type: 'prism' }
    });

    storage.upsertWorkItem({
      id: 'work-rerun',
      type: 'task',
      title: task.title,
      status: 'running',
      sourceTaskId: task.id,
      createdAt: nowIso,
      updatedAt: nowIso,
      artifactIds: []
    });

    // Mimic desktop main `taskRerun` handler cancellation logic.
    storage.cancelTaskRunsByTaskId(task.id, nowIso, 'Cancelled due to task rerun.');
    for (const item of storage.listWorkItems()) {
      if (item.status !== 'running') continue;
      if (item.sourceTaskId !== task.id) continue;
      storage.upsertWorkItem({
        ...item,
        status: 'cancelled',
        updatedAt: nowIso,
        lastError: 'Cancelled due to task rerun.'
      });
    }

    const activeRuns = storage.listActiveTaskRuns(task.id, new Date(nowIso));
    assert.equal(activeRuns.length, 0);

    const updatedWork = storage.listWorkItems().find((w) => w.id === 'work-rerun');
    assert.ok(updatedWork);
    assert.equal(updatedWork.status, 'cancelled');
  });

  await runCheck('prism override persistence', async () => {
    const override = { provider: 'ollama', modelId: 'qwen3:8b' };
    storage.savePrismProviderOverride(override);
    assert.deepEqual(storage.getPrismProviderOverride(), override);

    const reopened = new SqliteStorage(dbPath);
    reopened.init();
    try {
      assert.deepEqual(reopened.getPrismProviderOverride(), override);
    } finally {
      reopened.close();
    }
  });

  await runCheck('task scheduling normalization', async () => {
    const now = new Date('2026-03-18T12:00:00.000Z');
    const timezone = 'America/Chicago';
    const installedModelIds = DEFAULT_MODEL_PRESETS.map((model) => model.id);

    const onceTask = buildTaskSpec({
      title: 'Once Smoke Task',
      objective: 'Validate once scheduling',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'once', runAtLocal: '2026-03-18 09:30' }
    }, { now, timezone, installedModelIds, taskId: 'task-once' });

    const simpleTask = buildTaskSpec({
      title: 'Daily Smoke Task',
      objective: 'Validate daily scheduling',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'simple', preset: 'daily', time: '09:15' }
    }, { now, timezone, installedModelIds, taskId: 'task-daily' });

    const cronTask = buildTaskSpec({
      title: 'Cron Smoke Task',
      objective: 'Validate cron scheduling',
      mode: 'task',
      target: { type: 'prism' },
      schedule: { kind: 'cron', expression: '15 9 * * 1-5' }
    }, { now, timezone, installedModelIds, taskId: 'task-cron' });

    assert.equal(onceTask.schedule.kind, 'once');
    assert.equal(onceTask.schedule.timezone, timezone);
    assert.equal(onceTask.schedule.runAt, '2026-03-18T14:30:00.000Z');
    assert.equal(onceTask.nextRunAt, '2026-03-18T14:30:00.000Z');

    assert.equal(simpleTask.schedule.kind, 'simple');
    assert.equal(simpleTask.schedule.timezone, timezone);
    assert.equal(simpleTask.nextRunAt, '2026-03-18T14:15:00.000Z');

    assert.equal(cronTask.schedule.kind, 'cron');
    assert.equal(cronTask.schedule.timezone, timezone);
    assert.equal(cronTask.nextRunAt, '2026-03-18T14:15:00.000Z');

    storage.upsertTask(onceTask);
    storage.upsertTask(simpleTask);
    storage.upsertTask(cronTask);
    assert.equal(storage.listTasks().length >= 3, true);
  });

  await runCheck('basic workspace and artifact sync', async () => {
    const userMap = deepClone(EMPTY_USERMAP_STATE);
    userMap.publicTree.children.push({
      id: 'public-pref',
      label: 'Preferences',
      nodeType: 'category',
      visibility: 'public',
      children: [
        {
          id: 'public-pref-style',
          label: 'Response Style',
          value: 'Concise',
          nodeType: 'fact',
          visibility: 'public',
          children: [],
          source: 'manual'
        }
      ]
    });
    userMap.privateTree.children.push({
      id: 'private-projects',
      label: 'Projects',
      nodeType: 'category',
      visibility: 'private',
      children: [
        {
          id: 'private-project-main',
          label: 'Primary Project',
          value: 'Supreme Raman AI',
          nodeType: 'fact',
          visibility: 'private',
          children: [],
          source: 'manual',
          protected: true
        }
      ]
    });
    storage.saveUserMap(userMap);

    const agent = {
      id: 'agent-smoke',
      slug: 'smoke-agent',
      name: 'Smoke Agent',
      description: 'Runtime smoke agent',
      createdBy: 'prism',
      originObjective: 'Validate runtime smoke',
      persona: {
        role: 'Verifier',
        mission: 'Validate local runtime smoke paths.',
        systemInstructions: 'Use only local workspace context.'
      },
      providerStrategy: {
        mode: 'local_first',
        preferredLocalModelIds: ['qwen3:8b'],
        fallbackProviders: ['openai']
      },
      tools: ['workspace-read'],
      skills: ['analysis'],
      context: {
        userMapPaths: ['user/preferences'],
        workspacePaths: ['artifacts'],
        memoryNamespaces: ['global'],
        canReadArtifacts: true,
        canWriteArtifacts: true
      },
      runtime: {
        supportsChat: true,
        supportsTask: true,
        supportsRecurringTask: true,
        supportsMentions: true,
        groupEligible: true,
        councilEligible: true
      },
      safety: {
        allowExternalNetwork: false,
        allowFileWrites: true,
        allowShell: false,
        approvalMode: 'ask'
      },
      metadata: {
        createdAt: '2026-03-18T12:00:00.000Z',
        updatedAt: '2026-03-18T12:00:00.000Z',
        version: 1,
        source: 'prism-create'
      }
    };
    storage.upsertAgent(agent);

    storage.upsertGroup({
      id: 'group-smoke',
      name: 'Smoke Group',
      description: 'Runtime smoke group',
      memberAgentIds: [agent.id],
      routingMode: 'manual',
      autoRouteThreshold: 0.55
    });

    storage.upsertMemoryFacts([
      {
        id: 'fact-private',
        category: 'Projects',
        label: 'Primary Project',
        value: 'Supreme Raman AI',
        confidence: 0.95,
        visibility: 'private',
        source: 'manual',
        createdAt: '2026-03-18T12:00:00.000Z',
        updatedAt: '2026-03-18T12:00:00.000Z'
      },
      {
        id: 'fact-public',
        category: 'Preferences',
        label: 'Response Style',
        value: 'Concise',
        confidence: 0.91,
        visibility: 'public',
        source: 'manual',
        createdAt: '2026-03-18T12:00:00.000Z',
        updatedAt: '2026-03-18T12:00:00.000Z'
      }
    ]);

    storage.updateModel({
      id: 'qwen3:8b',
      provider: 'ollama',
      label: 'Qwen 3 8B',
      recommended: true,
      installed: true
    });

    const artifactDir = path.join(workspacePaths.artifacts, 'smoke-task');
    await mkdir(artifactDir, { recursive: true });
    const artifactRelativePath = path.relative(workspacePaths.root, path.join(artifactDir, 'result.md'));
    await writeFile(path.join(artifactDir, 'result.md'), '# Smoke artifact\n', 'utf8');

    storage.upsertArtifact({
      id: 'artifact-smoke',
      title: 'Smoke Artifact',
      kind: 'markdown',
      relativePath: artifactRelativePath,
      workItemId: 'work-smoke',
      taskId: 'task-once',
      createdAt: '2026-03-18T12:01:00.000Z'
    });

    storage.upsertWorkItem({
      id: 'work-smoke',
      type: 'task',
      title: 'Smoke Work Item',
      status: 'done',
      sourceTaskId: 'task-once',
      sourceAgentId: agent.id,
      createdAt: '2026-03-18T12:00:00.000Z',
      updatedAt: '2026-03-18T12:01:00.000Z',
      summary: 'Smoke work completed',
      artifactIds: ['artifact-smoke']
    });

    storage.upsertTaskRun({
      id: 'run-smoke',
      taskId: 'task-once',
      taskTitle: 'Once Smoke Task',
      taskObjective: 'Validate once scheduling',
      taskMode: 'task',
      status: 'done',
      claimToken: 'claim-smoke',
      claimedAt: '2026-03-18T12:00:00.000Z',
      leaseExpiresAt: '2026-03-18T12:05:00.000Z',
      createdAt: '2026-03-18T12:00:00.000Z',
      updatedAt: '2026-03-18T12:01:00.000Z',
      startedAt: '2026-03-18T12:00:00.000Z',
      completedAt: '2026-03-18T12:01:00.000Z',
      workerId: 'smoke-runner',
      attempt: 1,
      runIndex: 1,
      target: { type: 'prism' },
      provider: 'ollama',
      modelId: 'qwen3:8b',
      summary: 'Smoke run completed',
      artifactIds: ['artifact-smoke']
    });

    const snapshot = storage.getWorkspaceSnapshot();
    writeStructuredExports(workspacePaths, snapshot);
    const runtimeWorkspaceManager = new RuntimeWorkspaceManager();
    const workspacePlan = runtimeWorkspaceManager.buildPlan({
      profile: snapshot.profile,
      userMap: snapshot.userMap,
      agents: snapshot.agents,
      groups: snapshot.groups,
      memoryFacts: snapshot.memoryFacts,
      publicMemoryFacts: snapshot.publicMemoryFacts,
      privateMemoryFacts: snapshot.privateMemoryFacts
    });
    await syncRuntimeWorkspace(workspacePaths, snapshot, runtimeWorkspaceManager);
    const syncedWorkspaceRoot = path.join(workspacePaths.root, workspacePlan.rootDir);

    const requiredFiles = [
      path.join(workspacePaths.context, 'profile.json'),
      path.join(workspacePaths.context, 'usermap-tree.json'),
      path.join(workspacePaths.tasks, 'index.json'),
      path.join(workspacePaths.tasks, 'task-runs.json'),
      path.join(workspacePaths.work, 'artifacts.json'),
      path.join(syncedWorkspaceRoot, 'runtime.workspace.json'),
      path.join(syncedWorkspaceRoot, 'openclaw.workspace.json'),
      path.join(workspacePaths.root, artifactRelativePath)
    ];

    for (const filePath of requiredFiles) {
      await access(filePath);
    }

    const artifactsIndex = await readFile(path.join(workspacePaths.work, 'artifacts.json'), 'utf8');
    const manifestText = await readFile(path.join(syncedWorkspaceRoot, 'runtime.workspace.json'), 'utf8');
    assert.ok(artifactsIndex.includes('artifact-smoke'));
    assert.ok(manifestText.includes('Smoke Agent'));
    assert.ok(manifestText.includes('Smoke Group'));
  });

  console.log(`SUMMARY smoke:runtime passed ${checks.length} checks`);
} finally {
  storage.close();
  await rm(tempRoot, { recursive: true, force: true });
}
