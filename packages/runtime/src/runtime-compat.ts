import os from 'node:os';
import path from 'node:path';

/**
 * External runtime bridge compatibility.
 * Override via env: WORKSPACE_RUNTIME_CLI, WORKSPACE_RUNTIME_HOME.
 */
const _cli = process.env.WORKSPACE_RUNTIME_CLI;
const _home = process.env.WORKSPACE_RUNTIME_HOME;
export const EXTERNAL_RUNTIME_CLI = _cli && _cli.length > 0 ? _cli : 'workspace-runtime';
export const EXTERNAL_AUTH_DIR = path.join(os.homedir(), _home && _home.length > 0 ? _home : '.workspace-runtime');
export const EXTERNAL_AUTH_PROFILES_PATH = path.join(EXTERNAL_AUTH_DIR, 'auth-profiles.json');
export const EXTERNAL_SECRETS_PATH = path.join(EXTERNAL_AUTH_DIR, 'secrets.json');
export const EXTERNAL_WORKSPACE_MANIFEST_FILENAME = 'workspace-runtime.workspace.json';

