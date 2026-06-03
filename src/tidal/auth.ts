import {
  init,
  initializeLogin,
  finalizeLogin,
  credentialsProvider,
} from '@tidal-music/auth';
import { createAPIClient } from '@tidal-music/api';
import { createFileStorage, nodeCrypto } from './storage.js';

/** Scopes required to read and write playlists and the user's collection (favorites). */
export const TIDAL_SCOPES = [
  'user.read',
  'collection.read',
  'collection.write',
  'playlists.read',
  'playlists.write',
];

const CREDENTIALS_STORAGE_KEY = 'spotify_to_tidal';

let initialized = false;

/** Initialize the auth module with a Node-friendly storage + crypto backend. */
export async function initTidalAuth(clientId: string, clientSecret?: string): Promise<void> {
  if (initialized) return;
  await init({
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    credentialsStorageKey: CREDENTIALS_STORAGE_KEY,
    scopes: TIDAL_SCOPES,
    storage: createFileStorage(),
    crypto: nodeCrypto,
  });
  initialized = true;
}

/**
 * True if we hold a token tied to a *user* (not just an app/client-credentials token).
 * With a client secret configured, getCredentials() will happily mint an app-only token
 * that has no userId — that cannot read /users/me or the user's playlists, so we require
 * a userId to consider the session valid.
 */
export async function hasValidSession(): Promise<boolean> {
  try {
    const credentials = await credentialsProvider.getCredentials();
    return Boolean(credentials.token && credentials.userId);
  } catch {
    return false;
  }
}

/**
 * Build the TIDAL Authorization Code + PKCE login URL to send the browser to.
 * The redirectUri must exactly match one registered on the TIDAL app.
 */
export async function getTidalLoginUrl(redirectUri: string): Promise<string> {
  return initializeLogin({ redirectUri });
}

/**
 * Finalize login from the callback query string (e.g. "?code=...&state=...").
 * Exchanges the code for a user token and persists it.
 */
export async function finalizeTidalLogin(callbackQuery: string): Promise<void> {
  await finalizeLogin(callbackQuery);
}

/** Build an authenticated TIDAL API client. Assumes initTidalAuth() has run and a session exists. */
export function createTidalApiClient() {
  return createAPIClient(credentialsProvider);
}

/** Return the current credentials (auto-refreshing the token if needed). */
export function getCredentials() {
  return credentialsProvider.getCredentials();
}
