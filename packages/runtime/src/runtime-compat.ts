import os from 'node:os';
import path from 'node:path';

/**
 * External runtime bridge compatibility.
 * Override via env: SUPREME_RUNTIME_CLI, SUPREME_RUNTIME_HOME.
 */
const _cli = process.env.SUPREME_RUNTIME_CLI;
const _home = process.env.SUPREME_RUNTIME_HOME;
export const EXTERNAL_RUNTIME_CLI = _cli && _cli.length > 0 ? _cli : 'supreme-runtime';
export const EXTERNAL_AUTH_DIR = path.join(os.homedir(), _home && _home.length > 0 ? _home : '.supreme-runtime');
export const EXTERNAL_AUTH_PROFILES_PATH = path.join(EXTERNAL_AUTH_DIR, 'auth-profiles.json');
export const EXTERNAL_SECRETS_PATH = path.join(EXTERNAL_AUTH_DIR, 'secrets.json');
export const EXTERNAL_WORKSPACE_MANIFEST_FILENAME = 'supreme-runtime.workspace.json';

