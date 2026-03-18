import type { SqliteStorage } from '@supreme/storage';

export interface TaskRunHeartbeatController {
  stop: () => void;
  readonly isTimedOut: () => boolean;
}

export function startTaskRunHeartbeat(input: {
  storage: SqliteStorage;
  runId: string;
  claimToken: string;
  leaseMs: number;
  intervalMs: number;
  hardTimeoutMs: number;
}): TaskRunHeartbeatController {
  const startedAtMs = Date.now();
  let timedOut = false;
  let stopped = false;

  const handle = setInterval(() => {
    if (stopped) return;

    if (Date.now() - startedAtMs >= input.hardTimeoutMs) {
      timedOut = true;
      clearInterval(handle);
      return;
    }

    const now = new Date();
    const newLeaseExpiresAt = new Date(Date.now() + input.leaseMs).toISOString();
    input.storage.renewTaskRunLease(input.runId, input.claimToken, newLeaseExpiresAt, now.toISOString());
  }, input.intervalMs);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(handle);
    },
    isTimedOut: () => timedOut
  };
}

