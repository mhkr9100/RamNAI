/**
 * IPC channel allowlist for security (E17).
 * Only these channels may be invoked from the renderer.
 * All handlers must be registered in main.ts.
 */
import { channels } from './preload-api.js';

export const ALLOWED_IPC_CHANNELS = new Set<string>(Object.values(channels));

export function isAllowedChannel(channel: string): boolean {
  return ALLOWED_IPC_CHANNELS.has(channel);
}
