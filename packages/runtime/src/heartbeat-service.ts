import { EventEmitter } from 'node:events';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export interface HeartbeatTickEvent {
  timestamp: number;
  sequence: number;
  intervalMs: number;
}

export interface HeartbeatChecklistItem {
  id: string;
  description: string;
  handler: (tick: HeartbeatTickEvent) => Promise<{ acted: boolean; message?: string | undefined }>;
}

type HeartbeatEvents = {
  tick: [HeartbeatTickEvent];
  'checklist:result': [{ item: string; acted: boolean; message?: string | undefined }];
  error: [Error];
};

export class HeartbeatService extends EventEmitter<HeartbeatEvents> {
  private handle: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private checklist: HeartbeatChecklistItem[] = [];

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    if (this.handle) return;
    this.sequence = 0;

    this.handle = setInterval(() => {
      void this.fireTick(intervalMs);
    }, intervalMs);

    void this.fireTick(intervalMs);
  }

  stop(): void {
    if (!this.handle) return;
    clearInterval(this.handle);
    this.handle = null;
  }

  isRunning(): boolean {
    return this.handle !== null;
  }

  registerChecklistItem(item: HeartbeatChecklistItem): () => void {
    this.checklist.push(item);
    return () => {
      this.checklist = this.checklist.filter((c) => c.id !== item.id);
    };
  }

  onTick(callback: (event: HeartbeatTickEvent) => void): () => void {
    this.on('tick', callback);
    return () => this.off('tick', callback);
  }

  getChecklist(): readonly HeartbeatChecklistItem[] {
    return this.checklist;
  }

  private async fireTick(intervalMs: number): Promise<void> {
    this.sequence++;
    const event: HeartbeatTickEvent = {
      timestamp: Date.now(),
      sequence: this.sequence,
      intervalMs,
    };

    this.emit('tick', event);

    for (const item of this.checklist) {
      try {
        const result = await item.handler(event);
        this.emit('checklist:result', {
          item: item.id,
          acted: result.acted,
          message: result.message,
        });
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
