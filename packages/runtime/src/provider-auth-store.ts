import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import type { AuthSecretRef, ProviderAuthProfile, ProviderId } from '@supreme/shared';
import {
  EXTERNAL_AUTH_PROFILES_PATH,
  EXTERNAL_RUNTIME_CLI,
  EXTERNAL_SECRETS_PATH
} from './runtime-compat.js';

interface AuthProfilesFile {
  version: 1;
  profiles: ProviderAuthProfile[];
}

interface SecretsFile {
  providers: {
    [key in Exclude<ProviderId, 'ollama'>]?: {
      apiKey?: string;
      token?: string;
    };
  };
}

const APP_AUTH_DIR = path.join(os.homedir(), '.supreme-raman-ai', 'runtime-auth');
const APP_AUTH_PROFILES_PATH = path.join(APP_AUTH_DIR, 'auth-profiles.json');
// Legacy leftover from earlier iterations: ensure we never write provider secrets here again.
const APP_SECRETS_PATH = path.join(APP_AUTH_DIR, 'secrets.json');
const execFileAsync = promisify(execFile);

function makeFileSecretRef(provider: Exclude<ProviderId, 'ollama'>, field: 'apiKey' | 'token'): AuthSecretRef {
  return {
    source: 'file',
    provider: 'filemain',
    id: `/providers/${provider}/${field}`
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

async function readJsonFileOptional<T>(filePath: string): Promise<T | null> {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readMirroredJsonFile<T>(primaryPath: string, compatPath: string, fallback: T): Promise<T> {
  const primary = await readJsonFileOptional<T>(primaryPath);
  if (primary !== null) {
    return primary;
  }

  const compat = await readJsonFileOptional<T>(compatPath);
  if (compat !== null) {
    return compat;
  }

  return fallback;
}

async function writeMirroredJsonFile(
  primaryPath: string,
  compatPath: string,
  value: unknown
): Promise<void> {
  await writeJsonFile(primaryPath, value);
  await writeJsonFile(compatPath, value);
}

function getJsonPointerValue(container: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) {
    return undefined;
  }

  const segments = pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = container;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }

  return current;
}

export class ProviderAuthStore {
  async listProfiles(): Promise<ProviderAuthProfile[]> {
    const file = await readMirroredJsonFile<AuthProfilesFile>(
      APP_AUTH_PROFILES_PATH,
      EXTERNAL_AUTH_PROFILES_PATH,
      { version: 1, profiles: [] }
    );
    return file.profiles;
  }

  async upsertProfile(input: {
    id: string;
    provider: Exclude<ProviderId, 'ollama'>;
    label: string;
    description?: string;
    apiKey?: string;
    token?: string;
    isDefault?: boolean;
  }): Promise<ProviderAuthProfile> {
    const now = new Date().toISOString();
    const existingProfiles = await this.listProfiles();
    const others = existingProfiles.filter(
      (profile) => !(profile.id === input.id && profile.provider === input.provider)
    );

    const nextProfile: ProviderAuthProfile = {
      id: input.id,
      provider: input.provider,
      label: input.label,
      description: input.description ?? undefined,
      isDefault: input.isDefault ?? false,
      keyRef: input.apiKey ? makeFileSecretRef(input.provider, 'apiKey') : undefined,
      tokenRef: input.token ? makeFileSecretRef(input.provider, 'token') : undefined,
      createdAt: existingProfiles.find(
        (profile) => profile.id === input.id && profile.provider === input.provider
      )?.createdAt ?? now,
      updatedAt: now
    };

    const nextProfiles = [...others, nextProfile];

    await writeMirroredJsonFile(APP_AUTH_PROFILES_PATH, EXTERNAL_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: nextProfiles
    } satisfies AuthProfilesFile);

    if (input.apiKey || input.token) {
      await this.writeSecrets(input.provider, {
        apiKey: input.apiKey,
        token: input.token
      });
    }

    return nextProfile;
  }

  async writeSecrets(
    provider: Exclude<ProviderId, 'ollama'>,
    secrets: { apiKey?: string | undefined; token?: string | undefined }
  ): Promise<void> {
    // Best-effort cleanup: provider secrets must live only in the external runtime secrets store.
    void rm(APP_SECRETS_PATH, { force: true }).catch(() => undefined);

    const current = (await readJsonFileOptional<SecretsFile>(EXTERNAL_SECRETS_PATH)) ?? { providers: {} };
    const providers = { ...current.providers };
    const existing = providers[provider] ?? {};
    const next = {
      ...existing,
      ...(secrets.apiKey !== undefined ? { apiKey: secrets.apiKey } : {}),
      ...(secrets.token !== undefined ? { token: secrets.token } : {})
    };

    providers[provider] = next;

    await writeJsonFile(EXTERNAL_SECRETS_PATH, {
      providers
    } satisfies SecretsFile);
  }

  async deleteProfile(provider: Exclude<ProviderId, 'ollama'>, profileId: string): Promise<{ ok: true }> {
    const existingProfiles = await this.listProfiles();
    const nextProfiles = existingProfiles.filter(
      (profile) => !(profile.provider === provider && profile.id === profileId)
    );

    await writeMirroredJsonFile(APP_AUTH_PROFILES_PATH, EXTERNAL_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: nextProfiles
    } satisfies AuthProfilesFile);

    const hasRemainingForProvider = nextProfiles.some((profile) => profile.provider === provider);
    if (!hasRemainingForProvider) {
      const currentSecrets = (await readJsonFileOptional<SecretsFile>(EXTERNAL_SECRETS_PATH)) ?? { providers: {} };
      const providers = { ...currentSecrets.providers };
      delete providers[provider];
      void rm(APP_SECRETS_PATH, { force: true }).catch(() => undefined);
      await writeJsonFile(EXTERNAL_SECRETS_PATH, {
        providers
      } satisfies SecretsFile);
    }

    return { ok: true };
  }

  async testProfile(input: {
    provider: Exclude<ProviderId, 'ollama'>;
    profileId: string;
    probeWithRuntime?: boolean;
  }): Promise<{ ok: boolean; message: string }> {
    const profiles = await this.listProfiles();
    const profile = profiles.find((candidate) => candidate.provider === input.provider && candidate.id === input.profileId);
    if (!profile) {
      return { ok: false, message: 'Auth profile not found.' };
    }

    const secrets = await readMirroredJsonFile<unknown>(EXTERNAL_SECRETS_PATH, EXTERNAL_SECRETS_PATH, {});
    const refs: Array<{ kind: 'apiKey' | 'token'; ref: AuthSecretRef }> = [];
    if (profile.keyRef) refs.push({ kind: 'apiKey', ref: profile.keyRef });
    if (profile.tokenRef) refs.push({ kind: 'token', ref: profile.tokenRef });

    const missing: string[] = [];
    for (const entry of refs) {
      if (entry.ref.source !== 'file') {
        continue;
      }
      const value = getJsonPointerValue(secrets, entry.ref.id);
      if (typeof value !== 'string' || value.trim().length === 0) {
        missing.push(entry.kind);
      }
    }

    if (missing.length) {
      return { ok: false, message: `Missing secret value(s): ${missing.join(', ')}` };
    }

    if (input.probeWithRuntime) {
      try {
        await execFileAsync(EXTERNAL_RUNTIME_CLI, ['models', 'status', '--probe']);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message: `Secrets are present, but the runtime bridge probe failed: ${message}` };
      }
    }

    return { ok: true, message: 'Auth profile looks valid.' };
  }
}
