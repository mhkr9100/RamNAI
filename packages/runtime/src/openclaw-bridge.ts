import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EXTERNAL_RUNTIME_CLI } from './runtime-compat.js';

const execFileAsync = promisify(execFile);

const PROMPT_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 10_000;

export interface OpenClawModel {
  id: string;
  provider: string;
  installed: boolean;
}

export interface OpenClawPromptOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: string[];
}

export interface OpenClawPromptResult {
  text: string;
  provider: string;
  modelId: string;
}

export interface OpenClawHealthResult {
  ok: boolean;
  message: string;
}

export class OpenClawBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_AVAILABLE' | 'TIMEOUT' | 'PARSE_ERROR' | 'CLI_ERROR',
  ) {
    super(message);
    this.name = 'OpenClawBridgeError';
  }
}

export class OpenClawBridge {
  private cachedAvailable: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.cachedAvailable !== null) return this.cachedAvailable;
    try {
      await execFileAsync(EXTERNAL_RUNTIME_CLI, ['--version'], { timeout: HEALTH_TIMEOUT_MS });
      this.cachedAvailable = true;
      return true;
    } catch {
      this.cachedAvailable = false;
      return false;
    }
  }

  resetCache(): void {
    this.cachedAvailable = null;
  }

  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(EXTERNAL_RUNTIME_CLI, ['--version'], { timeout: HEALTH_TIMEOUT_MS });
      const version = stdout.trim().replace(/^v/i, '');
      return version || null;
    } catch {
      return null;
    }
  }

  async sendPrompt(opts: OpenClawPromptOptions): Promise<OpenClawPromptResult> {
    const available = await this.isAvailable();
    if (!available) {
      throw new OpenClawBridgeError(`${EXTERNAL_RUNTIME_CLI} CLI is not available`, 'NOT_AVAILABLE');
    }

    const args = [
      'prompt',
      '--model', opts.model,
      '--system', opts.systemPrompt,
      '--user', opts.userPrompt,
      '--format', 'json',
    ];

    if (opts.tools?.length) {
      args.push('--tools', opts.tools.join(','));
    }

    try {
      const { stdout } = await execFileAsync(EXTERNAL_RUNTIME_CLI, args, { timeout: PROMPT_TIMEOUT_MS });
      return this.parseJsonOutput<OpenClawPromptResult>(stdout);
    } catch (error) {
      if (this.isTimeoutError(error)) {
        throw new OpenClawBridgeError('Prompt timed out after 120s', 'TIMEOUT');
      }
      throw new OpenClawBridgeError(
        `CLI error: ${error instanceof Error ? error.message : String(error)}`,
        'CLI_ERROR',
      );
    }
  }

  async listModels(): Promise<OpenClawModel[]> {
    const available = await this.isAvailable();
    if (!available) return [];

    try {
      const { stdout } = await execFileAsync(EXTERNAL_RUNTIME_CLI, ['models', '--format', 'json'], { timeout: HEALTH_TIMEOUT_MS });
      const parsed = this.parseJsonOutput<{ models?: OpenClawModel[] }>(stdout);
      return parsed.models ?? [];
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<OpenClawHealthResult> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return { ok: false, message: `${EXTERNAL_RUNTIME_CLI} CLI not found on PATH` };
      }

      const version = await this.getVersion();
      const models = await this.listModels();
      return {
        ok: true,
        message: `${EXTERNAL_RUNTIME_CLI} v${version ?? 'unknown'} — ${models.length} model(s) available`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseJsonOutput<T>(raw: string): T {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end < start) {
      const arrStart = trimmed.indexOf('[');
      const arrEnd = trimmed.lastIndexOf(']');
      if (arrStart >= 0 && arrEnd >= arrStart) {
        return JSON.parse(trimmed.slice(arrStart, arrEnd + 1)) as T;
      }
      throw new OpenClawBridgeError('Unable to parse CLI output as JSON', 'PARSE_ERROR');
    }
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  }

  private isTimeoutError(error: unknown): boolean {
    if (error instanceof Error && 'killed' in error) {
      return (error as Error & { killed: boolean }).killed;
    }
    return false;
  }
}
