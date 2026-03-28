import os from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import type { ProviderId } from '@workspace/shared';
import { EXTERNAL_SECRETS_PATH } from './runtime-compat.js';

export interface SecretStoreCipher {
  id: string;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

interface SecretEnvelope {
  version: 1;
  cipher: string;
  payload: string;
}

export interface SecretsFile {
  providers: {
    [key in Exclude<ProviderId, 'ollama'>]?: {
      apiKey?: string;
      token?: string;
    };
  };
}

export interface SecretStoreOptions {
  cipher: SecretStoreCipher;
  appAuthDir?: string;
  secretFileName?: string;
  compatPath?: string;
}

const DEFAULT_AUTH_DIR = path.join(os.homedir(), '.workspace-app', 'runtime-auth');
const DEFAULT_SECRET_FILE = 'provider-secrets.enc.json';

async function readJsonFileOptional<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function emptySecrets(): SecretsFile {
  return { providers: {} };
}

function normalizeSecrets(value: SecretsFile): SecretsFile {
  return {
    providers: { ...value.providers }
  };
}

export class SecretStore {
  private readonly primaryPath: string;
  private readonly compatPath: string;

  constructor(private readonly options: SecretStoreOptions) {
    this.primaryPath = path.join(options.appAuthDir ?? DEFAULT_AUTH_DIR, options.secretFileName ?? DEFAULT_SECRET_FILE);
    this.compatPath = options.compatPath ?? EXTERNAL_SECRETS_PATH;
  }

  private async readEncryptedSecrets(): Promise<SecretsFile | null> {
    const envelope = await readJsonFileOptional<SecretEnvelope>(this.primaryPath);
    if (!envelope || envelope.version !== 1 || typeof envelope.payload !== 'string') {
      return null;
    }

    const decrypted = this.options.cipher.decrypt(envelope.payload);
    return normalizeSecrets(JSON.parse(decrypted) as SecretsFile);
  }

  private async writeEncryptedSecrets(value: SecretsFile): Promise<void> {
    const payload = this.options.cipher.encrypt(JSON.stringify(normalizeSecrets(value)));
    await writeJsonFile(this.primaryPath, {
      version: 1,
      cipher: this.options.cipher.id,
      payload
    } satisfies SecretEnvelope);
    await this.clearCompatibilitySecrets();
  }

  async readSecrets(): Promise<SecretsFile> {
    const encrypted = await this.readEncryptedSecrets();
    if (encrypted) {
      return encrypted;
    }

    const compat = await readJsonFileOptional<SecretsFile>(this.compatPath);
    if (compat) {
      const normalized = normalizeSecrets(compat);
      await this.writeEncryptedSecrets(normalized);
      await this.clearCompatibilitySecrets();
      return normalized;
    }

    return emptySecrets();
  }

  async updateProviderSecrets(
    provider: Exclude<ProviderId, 'ollama'>,
    secrets: {
      apiKey?: string | null;
      token?: string | null;
    }
  ): Promise<SecretsFile> {
    const current = await this.readSecrets();
    const providers = { ...current.providers };
    const next = { ...(providers[provider] ?? {}) };

    if (secrets.apiKey !== undefined) {
      if (typeof secrets.apiKey === 'string' && secrets.apiKey.trim().length > 0) {
        next.apiKey = secrets.apiKey;
      } else {
        delete next.apiKey;
      }
    }

    if (secrets.token !== undefined) {
      if (typeof secrets.token === 'string' && secrets.token.trim().length > 0) {
        next.token = secrets.token;
      } else {
        delete next.token;
      }
    }

    if (Object.keys(next).length === 0) {
      delete providers[provider];
    } else {
      providers[provider] = next;
    }

    const nextSecrets = normalizeSecrets({ providers });
    await this.writeEncryptedSecrets(nextSecrets);
    return nextSecrets;
  }

  async deleteProviderSecrets(provider: Exclude<ProviderId, 'ollama'>): Promise<SecretsFile> {
    const current = await this.readSecrets();
    const providers = { ...current.providers };
    delete providers[provider];
    const nextSecrets = normalizeSecrets({ providers });
    await this.writeEncryptedSecrets(nextSecrets);
    return nextSecrets;
  }

  async exportCompatibilitySecrets(): Promise<void> {
    await writeJsonFile(this.compatPath, await this.readSecrets());
  }

  async clearCompatibilitySecrets(): Promise<void> {
    await rm(this.compatPath, { force: true });
  }

  async withCompatibilitySecrets<T>(action: () => Promise<T>): Promise<T> {
    await this.exportCompatibilitySecrets();
    try {
      return await action();
    } finally {
      await this.clearCompatibilitySecrets();
    }
  }
}
