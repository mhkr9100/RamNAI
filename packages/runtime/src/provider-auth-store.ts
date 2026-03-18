import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
import type { SecretStoreCipher } from './secret-store.js';

interface AuthProfilesFile {
  version: 1;
  profiles: ProviderAuthProfile[];
}

interface SecretEnvelope {
  version: 1;
  cipher: string;
  payload: string;
}

interface SecretsFile {
  providers: Partial<Record<Exclude<ProviderId, 'ollama'>, {
    apiKey?: string;
    token?: string;
  }>>;
}

const APP_AUTH_DIR = path.join(os.homedir(), '.supreme-raman-ai', 'runtime-auth');
const APP_AUTH_PROFILES_PATH = path.join(APP_AUTH_DIR, 'auth-profiles.json');
const APP_SECRETS_PATH = path.join(APP_AUTH_DIR, 'secrets.enc.json');
const LEGACY_APP_SECRETS_PATH = path.join(APP_AUTH_DIR, 'secrets.json');
const execFileAsync = promisify(execFile);

function makeFileSecretRef(provider: Exclude<ProviderId, 'ollama'>, field: 'apiKey' | 'token'): AuthSecretRef {
  return {
    source: 'file',
    provider,
    id: `/providers/${provider}/${field}`
  };
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

async function readJsonFile<T>(filePath: string): Promise<T | null> {
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

export class ProviderAuthStore {
  constructor(private readonly cipher: SecretStoreCipher) {}

  async listProfiles(): Promise<ProviderAuthProfile[]> {
    const primary = await readJsonFile<AuthProfilesFile>(APP_AUTH_PROFILES_PATH);
    if (primary?.profiles) {
      return primary.profiles;
    }

    const compat = await readJsonFile<AuthProfilesFile>(EXTERNAL_AUTH_PROFILES_PATH);
    if (compat?.profiles) {
      await writeJsonFile(APP_AUTH_PROFILES_PATH, compat);
      return compat.profiles;
    }

    return [];
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
    const currentProfile = existingProfiles.find(
      (profile) => profile.id === input.id && profile.provider === input.provider
    );
    const nextSecrets = await this.mergeProviderSecrets(input.provider, {
      ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
      ...(input.token !== undefined ? { token: input.token } : {})
    });

    const others = existingProfiles.filter(
      (profile) => !(profile.id === input.id && profile.provider === input.provider)
    );

    const nextProfile: ProviderAuthProfile = {
      id: input.id,
      provider: input.provider,
      label: input.label,
      ...(input.description ? { description: input.description } : {}),
      ...(nextSecrets.apiKey ? { keyRef: makeFileSecretRef(input.provider, 'apiKey') } : {}),
      ...(nextSecrets.token ? { tokenRef: makeFileSecretRef(input.provider, 'token') } : {}),
      isDefault: input.isDefault ?? currentProfile?.isDefault ?? false,
      createdAt: currentProfile?.createdAt ?? now,
      updatedAt: now
    };

    await writeJsonFile(APP_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: [...others, nextProfile]
    } satisfies AuthProfilesFile);

    return nextProfile;
  }

  async deleteProfile(provider: Exclude<ProviderId, 'ollama'>, profileId: string): Promise<{ ok: true }> {
    const existingProfiles = await this.listProfiles();
    const nextProfiles = existingProfiles.filter(
      (profile) => !(profile.provider === provider && profile.id === profileId)
    );

    await writeJsonFile(APP_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: nextProfiles
    } satisfies AuthProfilesFile);

    const hasRemainingForProvider = nextProfiles.some((profile) => profile.provider === provider);
    if (!hasRemainingForProvider) {
      await this.deleteProviderSecrets(provider);
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

    const secrets = await this.readSecretState();
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
        await this.withRuntimeBridgeCompatibility(async () => {
          await execFileAsync(EXTERNAL_RUNTIME_CLI, ['models', 'status', '--probe']);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message: `Secrets are present, but the runtime bridge probe failed: ${message}` };
      }
    }

    return { ok: true, message: 'Auth profile looks valid.' };
  }

  async withRuntimeBridgeCompatibility<T>(action: () => Promise<T>): Promise<T> {
    await this.writeCompatibilityFiles();
    try {
      return await action();
    } finally {
      await this.clearCompatibilityFiles();
    }
  }

  private async mergeProviderSecrets(
    provider: Exclude<ProviderId, 'ollama'>,
    secrets: { apiKey?: string; token?: string }
  ) {
    const state = await this.readSecretState();
    const next: { apiKey?: string; token?: string } = { ...(state.providers[provider] ?? {}) };

    if (secrets.apiKey !== undefined) {
      const apiKey = secrets.apiKey.trim();
      if (apiKey) {
        next.apiKey = apiKey;
      } else {
        delete next.apiKey;
      }
    }

    if (secrets.token !== undefined) {
      const token = secrets.token.trim();
      if (token) {
        next.token = token;
      } else {
        delete next.token;
      }
    }

    if (!next.apiKey && !next.token) {
      delete state.providers[provider];
    } else {
      state.providers[provider] = next;
    }

    await this.writeSecretState(state);
    return next;
  }

  private async deleteProviderSecrets(provider: Exclude<ProviderId, 'ollama'>) {
    const state = await this.readSecretState();
    delete state.providers[provider];
    await this.writeSecretState(state);
  }

  private async readSecretState(): Promise<SecretsFile> {
    const encrypted = await readJsonFile<SecretEnvelope>(APP_SECRETS_PATH);
    if (encrypted?.payload) {
      const decrypted = this.cipher.decrypt(encrypted.payload);
      return JSON.parse(decrypted) as SecretsFile;
    }

    const legacyAppSecrets = await readJsonFile<SecretsFile>(LEGACY_APP_SECRETS_PATH);
    if (legacyAppSecrets?.providers) {
      await this.writeSecretState(legacyAppSecrets);
      await rm(LEGACY_APP_SECRETS_PATH, { force: true }).catch(() => undefined);
      return legacyAppSecrets;
    }

    const compatSecrets = await readJsonFile<SecretsFile>(EXTERNAL_SECRETS_PATH);
    if (compatSecrets?.providers) {
      await this.writeSecretState(compatSecrets);
      await rm(EXTERNAL_SECRETS_PATH, { force: true }).catch(() => undefined);
      return compatSecrets;
    }

    return { providers: {} };
  }

  private async writeSecretState(state: SecretsFile): Promise<void> {
    await mkdir(path.dirname(APP_SECRETS_PATH), { recursive: true });
    const envelope: SecretEnvelope = {
      version: 1,
      cipher: this.cipher.id,
      payload: this.cipher.encrypt(JSON.stringify(state))
    };
    await writeJsonFile(APP_SECRETS_PATH, envelope);
    await rm(LEGACY_APP_SECRETS_PATH, { force: true }).catch(() => undefined);
  }

  private async writeCompatibilityFiles(): Promise<void> {
    const profiles = await this.listProfiles();
    const secrets = await this.readSecretState();
    await writeJsonFile(EXTERNAL_AUTH_PROFILES_PATH, {
      version: 1,
      profiles
    } satisfies AuthProfilesFile);
    await writeJsonFile(EXTERNAL_SECRETS_PATH, secrets);
  }

  private async clearCompatibilityFiles(): Promise<void> {
    await Promise.all([
      rm(EXTERNAL_AUTH_PROFILES_PATH, { force: true }).catch(() => undefined),
      rm(EXTERNAL_SECRETS_PATH, { force: true }).catch(() => undefined)
    ]);
  }
}
