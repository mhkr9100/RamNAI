import * as nodeCrypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageTextCipher } from '@raman-ai/storage';

const METADATA_FILENAME = 'workspace-security.json';
const ENCRYPTED_TEXT_PREFIX = 'SRMAI_ENC:';
const KEYCHECK_MESSAGE = 'raman-ai-workspace-keycheck';
const ARGON2_MEMORY_KIB = 64 * 1024;
const ARGON2_PASSES = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_TAG_LENGTH = 32;

interface EncryptionEnvelope {
  version: 1;
  algorithm: 'aes-256-gcm';
  nonce: string;
  ciphertext: string;
  tag: string;
}

interface WorkspaceSecurityMetadata {
  version: 1;
  enabled: true;
  kdf: {
    algorithm: 'argon2id';
    memoryKiB: number;
    passes: number;
    parallelism: number;
    tagLength: number;
  };
  salt: string;
  verifier: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSecurityState {
  enabled: boolean;
  locked: boolean;
  ready: boolean;
}

function encodeEnvelope(envelope: EncryptionEnvelope): string {
  return `${ENCRYPTED_TEXT_PREFIX}${JSON.stringify(envelope)}`;
}

function decodeEnvelope(value: string): EncryptionEnvelope | null {
  if (!value.startsWith(ENCRYPTED_TEXT_PREFIX)) {
    return null;
  }

  return JSON.parse(value.slice(ENCRYPTED_TEXT_PREFIX.length)) as EncryptionEnvelope;
}

function encryptWithKey(key: Buffer, value: string): string {
  const nonce = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return encodeEnvelope({
    version: 1,
    algorithm: 'aes-256-gcm',
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  });
}

function decryptWithKey(key: Buffer, envelopeText: string): string {
  const envelope = decodeEnvelope(envelopeText);
  if (!envelope) {
    return envelopeText;
  }

  const decipher = nodeCrypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.nonce, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]);

  return plaintext.toString('utf8');
}

function deriveKey(password: string, saltBase64: string): Buffer {
  const argon2Sync = (nodeCrypto as typeof nodeCrypto & {
    argon2Sync?: (algorithm: string, opts: {
      message: string;
      nonce: Buffer;
      parallelism: number;
      tagLength: number;
      memory: number;
      passes: number;
    }) => Buffer;
  }).argon2Sync;
  if (typeof argon2Sync !== 'function') {
    throw new Error('Argon2id is not available in this Node runtime.');
  }

  return argon2Sync('argon2id', {
    message: password.normalize('NFKC'),
    nonce: Buffer.from(saltBase64, 'base64'),
    parallelism: ARGON2_PARALLELISM,
    tagLength: ARGON2_TAG_LENGTH,
    memory: ARGON2_MEMORY_KIB,
    passes: ARGON2_PASSES
  });
}

const PASSTHROUGH_STORAGE_CIPHER: StorageTextCipher = {
  id: 'plain',
  enabled: false,
  encrypt(value: string) {
    return value;
  },
  decrypt(value: string) {
    return value;
  },
  isEncrypted(_value: string) {
    return false;
  }
};

export class WorkspaceEncryptionManager {
  private metadata: WorkspaceSecurityMetadata | null = null;
  private key: Buffer | null = null;
  private readonly metadataPath: string;

  constructor(private readonly userDataPath: string) {
    this.metadataPath = path.join(userDataPath, METADATA_FILENAME);
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.metadataPath, 'utf8')) as WorkspaceSecurityMetadata;
      if (parsed?.enabled && parsed.salt && parsed.verifier) {
        this.metadata = parsed;
        this.key = null;
        return;
      }
    } catch {
      // No metadata file means encryption is disabled.
    }

    this.metadata = null;
    this.key = null;
  }

  getState(): WorkspaceSecurityState {
    const enabled = Boolean(this.metadata?.enabled);
    const locked = enabled && !this.key;
    return {
      enabled,
      locked,
      ready: !locked
    };
  }

  isEncryptionEnabled(): boolean {
    return Boolean(this.metadata?.enabled);
  }

  isUnlocked(): boolean {
    return this.key !== null;
  }

  isEncryptedText(value: string): boolean {
    return value.startsWith(ENCRYPTED_TEXT_PREFIX);
  }

  getStorageCipher(): StorageTextCipher {
    if (!this.metadata || !this.key) {
      return PASSTHROUGH_STORAGE_CIPHER;
    }

    return {
      id: 'workspace-aes-256-gcm',
      enabled: true,
      encrypt: (value: string) => encryptWithKey(this.key as Buffer, value),
      decrypt: (value: string) => decryptWithKey(this.key as Buffer, value),
      isEncrypted: (value: string) => this.isEncryptedText(value)
    };
  }

  encryptText(value: string): string {
    if (!this.metadata || !this.key) {
      return value;
    }

    return encryptWithKey(this.key, value);
  }

  decryptText(value: string): string {
    if (!this.isEncryptedText(value)) {
      return value;
    }

    if (!this.key) {
      throw new Error('Raman AI is locked.');
    }

    return decryptWithKey(this.key, value);
  }

  async unlock(password: string): Promise<void> {
    if (!this.metadata) {
      return;
    }

    if (!password.trim()) {
      throw new Error('Raman AI password is required.');
    }

    const candidateKey = deriveKey(password, this.metadata.salt);
    const verifier = decryptWithKey(candidateKey, this.metadata.verifier);
    if (verifier !== KEYCHECK_MESSAGE) {
      throw new Error('Incorrect Raman AI password.');
    }

    this.key = candidateKey;
  }

  async enable(password: string): Promise<void> {
    if (this.metadata) {
      throw new Error('Data encryption is already enabled.');
    }

    if (!password.trim()) {
      throw new Error('Raman AI password is required.');
    }

    const salt = nodeCrypto.randomBytes(16).toString('base64');
    const key = deriveKey(password, salt);
    const now = new Date().toISOString();
    const metadata: WorkspaceSecurityMetadata = {
      version: 1,
      enabled: true,
      kdf: {
        algorithm: 'argon2id',
        memoryKiB: ARGON2_MEMORY_KIB,
        passes: ARGON2_PASSES,
        parallelism: ARGON2_PARALLELISM,
        tagLength: ARGON2_TAG_LENGTH
      },
      salt,
      verifier: encryptWithKey(key, KEYCHECK_MESSAGE),
      createdAt: now,
      updatedAt: now
    };

    await mkdir(this.userDataPath, { recursive: true });
    await writeFile(this.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    this.metadata = metadata;
    this.key = key;
  }

  async disable(password: string): Promise<void> {
    if (!this.metadata) {
      return;
    }

    if (!this.key) {
      await this.unlock(password);
    } else if (password.trim()) {
      const candidateKey = deriveKey(password, this.metadata.salt);
      const verifier = decryptWithKey(candidateKey, this.metadata.verifier);
      if (verifier !== KEYCHECK_MESSAGE) {
        throw new Error('Incorrect Raman AI password.');
      }
    }

    await rm(this.metadataPath, { force: true });
    this.metadata = null;
    this.key = null;
  }
}
