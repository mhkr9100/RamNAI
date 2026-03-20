import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EXTERNAL_RUNTIME_CLI } from './runtime-compat.js';

const execFileAsync = promisify(execFile);

const AGENT_TIMEOUT_MS = 120_000;
const LIST_TIMEOUT_MS = 15_000;

export interface BridgeAgent {
  id: string;
  model: string;
  workspace: string;
  routingRules: number;
}

export interface BridgeSession {
  key: string;
  kind: string;
  model: string;
  age: string;
  tokens: string;
}

export interface BridgeGatewayStatus {
  running: boolean;
  port: number;
  agents: number;
  channels: string[];
  version: string;
}

export interface AgentTurnResult {
  text: string;
  agentId: string;
  success: boolean;
  durationMs: number;
}

export interface BridgeChannel {
  id: string;
  provider: string;
  enabled: boolean;
  accountName: string;
}

export interface BridgeChannelStatus {
  channel: string;
  connected: boolean;
  lastActivity: string;
  messageCount: number;
}

export class BridgeAgentManager {
  async listAgents(): Promise<BridgeAgent[]> {
    try {
      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['agents', 'list', '--json'],
        { timeout: LIST_TIMEOUT_MS },
      );
      const parsed = this.tryParseJson<{ agents?: BridgeAgent[] }>(stdout);
      return parsed?.agents ?? [];
    } catch {
      return [];
    }
  }

  async sendMessage(agentId: string, message: string, timeoutMs = AGENT_TIMEOUT_MS): Promise<AgentTurnResult> {
    const start = Date.now();
    try {
      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['agent', '--agent', agentId, '--message', message, '--local', '--timeout', String(Math.ceil(timeoutMs / 1000))],
        { timeout: timeoutMs + 5000 },
      );

      const text = this.extractResponseText(stdout);
      return {
        text,
        agentId,
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        text: error instanceof Error ? error.message : String(error),
        agentId,
        success: false,
        durationMs: Date.now() - start,
      };
    }
  }

  async getSessions(agentId?: string): Promise<BridgeSession[]> {
    try {
      const args = ['sessions', '--json'];
      if (agentId) args.push('--agent', agentId);

      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        args,
        { timeout: LIST_TIMEOUT_MS },
      );
      const parsed = this.tryParseJson<{ sessions?: BridgeSession[] }>(stdout);
      return parsed?.sessions ?? [];
    } catch {
      return [];
    }
  }

  async getStatus(): Promise<BridgeGatewayStatus | null> {
    try {
      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['status', '--json'],
        { timeout: LIST_TIMEOUT_MS },
      );
      return this.tryParseJson<BridgeGatewayStatus>(stdout);
    } catch {
      return null;
    }
  }

  async restartGateway(): Promise<boolean> {
    try {
      await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['gateway', 'restart'],
        { timeout: LIST_TIMEOUT_MS },
      );
      return true;
    } catch {
      return false;
    }
  }

  private extractResponseText(stdout: string): string {
    const lines = stdout.split('\n');
    const filtered = lines.filter(
      (line) => !line.startsWith('[') && line.trim().length > 0,
    );
    return filtered.join('\n').trim();
  }

  async listChannels(): Promise<BridgeChannel[]> {
    try {
      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['channels', 'list', '--json'],
        { timeout: LIST_TIMEOUT_MS },
      );
      const parsed = this.tryParseJson<{ channels?: BridgeChannel[] }>(stdout);
      return parsed?.channels ?? [];
    } catch {
      return [];
    }
  }

  async addChannel(channel: string, token: string): Promise<boolean> {
    try {
      await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['channels', 'add', '--channel', channel, '--token', token],
        { timeout: LIST_TIMEOUT_MS },
      );
      return true;
    } catch {
      return false;
    }
  }

  async removeChannel(channel: string): Promise<boolean> {
    try {
      await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['channels', 'remove', '--channel', channel],
        { timeout: LIST_TIMEOUT_MS },
      );
      return true;
    } catch {
      return false;
    }
  }

  async getChannelStatus(): Promise<BridgeChannelStatus[]> {
    try {
      const { stdout } = await execFileAsync(
        EXTERNAL_RUNTIME_CLI,
        ['channels', 'status', '--json'],
        { timeout: LIST_TIMEOUT_MS },
      );
      const parsed = this.tryParseJson<{ statuses?: BridgeChannelStatus[] }>(stdout);
      return parsed?.statuses ?? [];
    } catch {
      return [];
    }
  }

  private tryParseJson<T>(raw: string): T | null {
    const trimmed = raw.trim();
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1)) as T;
      } catch { /* fall through */ }
    }

    const arrStart = trimmed.indexOf('[');
    const arrEnd = trimmed.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(trimmed.slice(arrStart, arrEnd + 1)) as T;
      } catch { /* fall through */ }
    }

    return null;
  }
}
