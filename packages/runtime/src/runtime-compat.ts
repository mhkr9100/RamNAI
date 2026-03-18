import os from 'node:os';
import path from 'node:path';

/**
 * Third-party/external runtime compatibility constants.
 *
 * Supreme Raman AI should not spread vendor naming across normal code paths.
 * All compatibility strings (binary name, auth/workspace mirror filenames, etc.)
 * are centralized here.
 */

// External CLI binary used by the local runtime bridge compatibility layer.
export const EXTERNAL_RUNTIME_CLI = 'openclaw';

// External runtime auth mirror location (OpenClaw-compatible).
export const EXTERNAL_AUTH_DIR = path.join(os.homedir(), '.openclaw');
export const EXTERNAL_AUTH_PROFILES_PATH = path.join(EXTERNAL_AUTH_DIR, 'auth-profiles.json');
export const EXTERNAL_SECRETS_PATH = path.join(EXTERNAL_AUTH_DIR, 'secrets.json');

// External runtime workspace manifest filename (OpenClaw-compatible).
export const EXTERNAL_WORKSPACE_MANIFEST_FILENAME = 'openclaw.workspace.json';

