import type { SqliteStorage } from '@workspace/storage';
import type { TaskSpec, TaskRunRecord, WorkItem } from '@workspace/shared';
import { isRecurring } from './task-scheduling.js';

const RECOVERY_ERROR_MESSAGE = 'Recovered after app restart during an in-progress run.';

function isLeaseStillActive(run: TaskRunRecord, nowIso: string): boolean {
  if (!run.leaseExpiresAt) return false;
  const leaseMs = Date.parse(run.leaseExpiresAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(leaseMs) || Number.isNaN(nowMs)) return false;
  return leaseMs > nowMs;
}

export function recoverInterruptedWork(storage: SqliteStorage, now: Date): void {
  const nowIso = now.toISOString();
  const tasks = storage.listTasks();
  const workItems = storage.listWorkItems();

  for (const task of tasks) {
    const taskRuns = storage
      .listTaskRuns(task.id)
      .filter((run) => run.status === 'claimed' || run.status === 'running');

    if (taskRuns.length === 0) continue;

    const hasActiveLease = taskRuns.some((run) => isLeaseStillActive(run, nowIso));
    if (hasActiveLease) continue;

    const recurring = isRecurring(task.schedule);
    const recoveredTaskStatus: TaskSpec['status'] = recurring ? 'queued' : 'failed';

    const recoveredTask: TaskSpec = {
      ...task,
      status: recoveredTaskStatus,
      updatedAt: nowIso,
      completedAt: nowIso,
      lastRunAt: nowIso,
      lastError: RECOVERY_ERROR_MESSAGE,
      artifactIds: [],
      runCount: task.runCount + 1,
      ...(recurring ? { nextRunAt: nowIso } : {})
    };
    storage.upsertTask(recoveredTask);

    for (const runRecord of taskRuns) {
      storage.upsertTaskRun({
        ...runRecord,
        status: 'failed',
        updatedAt: nowIso,
        completedAt: nowIso,
        leaseExpiresAt: nowIso,
        lastError: RECOVERY_ERROR_MESSAGE
      });
    }

    for (const item of workItems) {
      if (item.status !== 'running') continue;
      if (item.sourceTaskId !== task.id) continue;

      storage.upsertWorkItem({
        ...item,
        status: 'failed',
        updatedAt: nowIso,
        lastError: RECOVERY_ERROR_MESSAGE
      } as WorkItem);
    }
  }
}

