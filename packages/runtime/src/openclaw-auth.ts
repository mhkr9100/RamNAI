import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AuthSecretRef, ProviderAuthProfile, ProviderId } from '@supreme/shared';

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

const AUTH_DIR = path.join(os.homedir(), '.openclaw');
const AUTH_PROFILES_PATH = path.join(AUTH_DIR, 'auth-profiles.json');
const SECRETS_PATH = path.join(AUTH_DIR, 'secrets.json');

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

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export class OpenClawAuthManager {
  async listProfiles(): Promise<ProviderAuthProfile[]> {
    const file = await readJsonFile<AuthProfilesFile>(AUTH_PROFILES_PATH, { version: 1, profiles: [] });
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

    await writeJsonFile(AUTH_PROFILES_PATH, {
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
    const current = await readJsonFile<SecretsFile>(SECRETS_PATH, { providers: {} });
    const providers = { ...current.providers };
    const existing = providers[provider] ?? {};
    const next = {
      ...existing,
      ...(secrets.apiKey !== undefined ? { apiKey: secrets.apiKey } : {}),
      ...(secrets.token !== undefined ? { token: secrets.token } : {})
    };

    providers[provider] = next;

    await writeJsonFile(SECRETS_PATH, {
      providers
    } satisfies SecretsFile);
  }
}

