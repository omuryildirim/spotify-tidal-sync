import {
  init,
  initializeLogin,
  finalizeLogin,
  credentialsProvider,
  type StorageAdapter,
  type CryptoAdapter,
} from '@tidal-music/auth';
import { createAPIClient } from '@tidal-music/api';
import { TIDAL_SCOPES } from '../config';

const CREDENTIALS_STORAGE_KEY = 'spotify-tidal-sync';

/** Persist the auth module's credential blob in localStorage. */
const browserStorage: StorageAdapter = {
  async load(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async save(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};

const browserCrypto: CryptoAdapter = {
  digest: (algorithm: string, data: BufferSource) => crypto.subtle.digest(algorithm, data),
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T =>
    crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T,
};

let initialized = false;

/** Initialize the auth module as a public PKCE client (no secret — runs entirely in the browser). */
export async function initTidalAuth(clientId: string): Promise<void> {
  if (initialized) return;
  await init({
    clientId,
    credentialsStorageKey: CREDENTIALS_STORAGE_KEY,
    scopes: TIDAL_SCOPES,
    storage: browserStorage,
    crypto: browserCrypto,
  });
  initialized = true;
}

/** True if we hold a user token (not just an app token, which has no userId). */
export async function hasValidSession(): Promise<boolean> {
  try {
    const credentials = await credentialsProvider.getCredentials();
    return Boolean(credentials.token && credentials.userId);
  } catch {
    return false;
  }
}

/** Build the TIDAL Authorization Code + PKCE login URL to send the browser to. */
export async function getTidalLoginUrl(redirectUri: string): Promise<string> {
  return initializeLogin({ redirectUri });
}

/** Finalize login from the callback query string (e.g. "?code=...&state=..."). */
export async function finalizeTidalLogin(callbackQuery: string): Promise<void> {
  await finalizeLogin(callbackQuery);
}

/** Build an authenticated TIDAL API client. Assumes initTidalAuth() ran and a session exists. */
export function createTidalApiClient() {
  return createAPIClient(credentialsProvider);
}

export function getCredentials() {
  return credentialsProvider.getCredentials();
}
