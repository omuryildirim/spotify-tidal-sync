import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Directory where we persist credentials, the match cache and resume checkpoints.
 * Lives under the user's home so it is stable regardless of the working directory.
 */
export const STATE_DIR = join(homedir(), '.spotify_to_tidal');

export function ensureStateDir(): string {
  mkdirSync(STATE_DIR, { recursive: true });
  return STATE_DIR;
}

export function stateFile(name: string): string {
  ensureStateDir();
  return join(STATE_DIR, name);
}

export const TIDAL_CREDENTIALS_FILE = 'tidal-credentials.json';
export const SPOTIFY_TOKEN_FILE = 'spotify-token.json';
export const CACHE_DB_FILE = 'cache.db';
export const SYNC_HISTORY_FILE = 'sync-history.json';
