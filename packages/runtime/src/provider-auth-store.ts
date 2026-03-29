import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import type { AuthSecretRef, ProviderAuthProfile, ProviderId } from '@raman-ai/shared';
import {
  EXTERNAL_AUTH_PROFILES_PATH,
  EXTERNAL_RUNTIME_CLI,
  EXTERNAL_SECRETS_PATH
} from './runtime-compat.js';
import type { SecretStoreCipher } from './secret-store.js';

const NATIVE_SECRETS_SERVICE = 'com.raman-ai.provider-secrets';
const NATIVE_SECRETS_ACCOUNT = 'provider-secrets';

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

export interface ResolvedProviderCredentials {
  profile: ProviderAuthProfile;
  apiKey?: string;
  token?: string;
}

const APP_AUTH_DIR = path.join(os.homedir(), '.raman-ai', 'runtime-auth');
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

function isKeychainError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /keychain|cannot be found|securityd|SecItem/i.test(msg);
}

export class ProviderAuthStore {
  private nativeKeytar: any | null = null;
  /** When true, keytar caused keychain prompts; skip it for the rest of the session. */
  private keytarDisabled = false;

  constructor(private readonly cipher: SecretStoreCipher) {}

  private async getKeytar(): Promise<any | null> {
    if (this.keytarDisabled) return null;
    if (process.env.WORKSPACE_SKIP_KEYCHAIN === '1') return null;
    if (this.nativeKeytar) return this.nativeKeytar;
    try {
      const mod = await import('keytar');
      // keytar is CJS; ESM import may expose default.
      const keytar = (mod as any).default ?? mod;
      if (typeof keytar?.getPassword !== 'function' || typeof keytar?.setPassword !== 'function') {
        this.nativeKeytar = null;
        return null;
      }
      this.nativeKeytar = keytar;
      return keytar;
    } catch {
      this.nativeKeytar = null;
      return null;
    }
  }

  private disableKeytar(): void {
    this.keytarDisabled = true;
    this.nativeKeytar = null;
  }

  private async readNativeSecretState(): Promise<SecretsFile | null> {
    const keytar = await this.getKeytar();
    if (!keytar) return null;

    try {
      const json = await keytar.getPassword(NATIVE_SECRETS_SERVICE, NATIVE_SECRETS_ACCOUNT);
      if (!json) return null;
      const parsed = JSON.parse(json) as SecretsFile;
      if (!parsed?.providers || typeof parsed.providers !== 'object') return null;
      return parsed;
    } catch (err) {
      if (isKeychainError(err)) this.disableKeytar();
      return null;
    }
  }

  private async writeNativeSecretState(state: SecretsFile): Promise<boolean> {
    const keytar = await this.getKeytar();
    if (!keytar) return false;

    try {
      await keytar.setPassword(NATIVE_SECRETS_SERVICE, NATIVE_SECRETS_ACCOUNT, JSON.stringify(state));
      return true;
    } catch (err) {
      if (isKeychainError(err)) this.disableKeytar();
      return false;
    }
  }

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
    const enforceSingleDefault = input.isDefault === true;
    const nextIsDefault = input.isDefault ?? currentProfile?.isDefault ?? false;

    const others = existingProfiles
      .filter((profile) => !(profile.id === input.id && profile.provider === input.provider))
      .map((profile) => {
        if (!enforceSingleDefault) return profile;
        if (profile.provider !== input.provider) return profile;
        return { ...profile, isDefault: false };
      });

    const nextProfile: ProviderAuthProfile = {
      id: input.id,
      provider: input.provider,
      label: input.label,
      ...(input.description ? { description: input.description } : {}),
      ...(nextSecrets.apiKey ? { keyRef: makeFileSecretRef(input.provider, 'apiKey') } : {}),
      ...(nextSecrets.token ? { tokenRef: makeFileSecretRef(input.provider, 'token') } : {}),
      isDefault: nextIsDefault,
      createdAt: currentProfile?.createdAt ?? now,
      updatedAt: now
    };

    await writeJsonFile(APP_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: [...others, nextProfile]
    } satisfies AuthProfilesFile);

    return nextProfile;
  }

  async setProviderDefaultProfile(
    provider: Exclude<ProviderId, 'ollama'>,
    profileId: string | null
  ): Promise<{ ok: true }> {
    const existingProfiles = await this.listProfiles();
    const nextProfiles = existingProfiles.map((profile) => {
      if (profile.provider !== provider) return profile;
      return {
        ...profile,
        isDefault: profileId ? profile.id === profileId : false
      };
    });

    await writeJsonFile(APP_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: nextProfiles
    } satisfies AuthProfilesFile);

    return { ok: true };
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

  async resolveProfile(
    provider: Exclude<ProviderId, 'ollama'>,
    profileId?: string | null
  ): Promise<ResolvedProviderCredentials | null> {
    const profiles = (await this.listProfiles()).filter((profile) => profile.provider === provider);
    const selected = profileId
      ? profiles.find((profile) => profile.id === profileId) ?? null
      : profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
    if (!selected) {
      return null;
    }

    const secrets = await this.readSecretState();
    const resolved: ResolvedProviderCredentials = { profile: selected };

    if (selected.keyRef?.source === 'file') {
      const apiKey = getJsonPointerValue(secrets, selected.keyRef.id);
      if (typeof apiKey === 'string' && apiKey.trim()) {
        resolved.apiKey = apiKey.trim();
      }
    }

    if (selected.tokenRef?.source === 'file') {
      const token = getJsonPointerValue(secrets, selected.tokenRef.id);
      if (typeof token === 'string' && token.trim()) {
        resolved.token = token.trim();
      }
    }

    return resolved;
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
    const native = await this.readNativeSecretState();
    if (native) {
      return native;
    }

    const encrypted = await readJsonFile<SecretEnvelope>(APP_SECRETS_PATH);
    if (encrypted?.payload) {
      const decrypted = this.cipher.decrypt(encrypted.payload);
      const parsed = JSON.parse(decrypted) as SecretsFile;
      // Best-effort migration to native secure storage.
      await this.writeNativeSecretState(parsed).catch(() => undefined);
      return parsed;
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
    const storedInNative = await this.writeNativeSecretState(state).catch(() => false);
    if (storedInNative) {
      // Native store is the preferred live backend, but keep the encrypted file updated as a fallback.
      await mkdir(path.dirname(APP_SECRETS_PATH), { recursive: true });
      const envelope: SecretEnvelope = {
        version: 1,
        cipher: this.cipher.id,
        payload: this.cipher.encrypt(JSON.stringify(state))
      };
      await writeJsonFile(APP_SECRETS_PATH, envelope).catch(() => undefined);
      await rm(LEGACY_APP_SECRETS_PATH, { force: true }).catch(() => undefined);
      return;
    }

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
    const defaultProfiles = profiles.filter((profile) => profile.isDefault);
    const exportedProfiles = defaultProfiles.length ? defaultProfiles : profiles;
    const providerIds = new Set(exportedProfiles.map((profile) => profile.provider));

    const secrets = await this.readSecretState();
    const filteredProviders: SecretsFile['providers'] = {};
    for (const [providerId, providerSecrets] of Object.entries(secrets.providers)) {
      if (!providerSecrets) continue;
      if (providerIds.has(providerId as Exclude<ProviderId, 'ollama'>)) {
        filteredProviders[providerId as Exclude<ProviderId, 'ollama'>] = providerSecrets;
      }
    }

    await writeJsonFile(EXTERNAL_AUTH_PROFILES_PATH, {
      version: 1,
      profiles: exportedProfiles
    } satisfies AuthProfilesFile);
    await writeJsonFile(EXTERNAL_SECRETS_PATH, { providers: filteredProviders });
  }

  private async clearCompatibilityFiles(): Promise<void> {
    await Promise.all([
      rm(EXTERNAL_AUTH_PROFILES_PATH, { force: true }).catch(() => undefined),
      rm(EXTERNAL_SECRETS_PATH, { force: true }).catch(() => undefined)
    ]);
  }
}
