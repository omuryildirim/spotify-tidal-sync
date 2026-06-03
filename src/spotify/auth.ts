import { readFileSync, writeFileSync } from 'node:fs';
import { SpotifyApi, type AccessToken } from '@spotify/web-api-ts-sdk';
import type { SpotifyConfig } from '../config.js';
import { stateFile, SPOTIFY_TOKEN_FILE } from '../util/paths.js';

const SCOPES = ['playlist-read-private', 'user-library-read'];
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

interface StoredToken extends AccessToken {
  /** Absolute epoch ms at which access_token expires. */
  expires: number;
}

function loadToken(): StoredToken | null {
  try {
    return JSON.parse(readFileSync(stateFile(SPOTIFY_TOKEN_FILE), 'utf8')) as StoredToken;
  } catch {
    return null;
  }
}

function saveToken(token: AccessToken): StoredToken {
  const stored: StoredToken = { ...token, expires: token.expires ?? Date.now() + token.expires_in * 1000 };
  writeFileSync(stateFile(SPOTIFY_TOKEN_FILE), JSON.stringify(stored, null, 2), { mode: 0o600 });
  return stored;
}

function basicAuth(config: SpotifyConfig): string {
  return Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
}

/** Build the authorize URL to send the user's browser to. */
export function buildSpotifyAuthUrl(config: SpotifyConfig): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.client_id,
    scope: SCOPES.join(' '),
    redirect_uri: config.redirect_uri!,
  }).toString();
  return url.toString();
}

/** Exchange an authorization code (from the callback) for tokens and persist them. */
export async function completeSpotifyLogin(config: SpotifyConfig, code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth(config)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirect_uri! }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  saveToken((await res.json()) as AccessToken);
}

async function refresh(config: SpotifyConfig, refreshToken: string): Promise<StoredToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth(config)}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
  const token = (await res.json()) as AccessToken;
  if (!token.refresh_token) token.refresh_token = refreshToken;
  return saveToken(token);
}

/** True if a stored token exists (valid or refreshable). */
export function hasStoredSpotifyToken(): boolean {
  const stored = loadToken();
  return Boolean(stored && (stored.expires > Date.now() + 60_000 || stored.refresh_token));
}

/**
 * Build an authenticated Spotify client from the stored token, refreshing if near expiry.
 * Throws if there is no stored token (the caller should start the login flow).
 */
export async function openSpotifySession(config: SpotifyConfig): Promise<SpotifyApi> {
  let stored = loadToken();
  if (!stored) throw new Error('Not logged in to Spotify');
  if (stored.expires <= Date.now() + 60_000 && stored.refresh_token) {
    stored = await refresh(config, stored.refresh_token);
  }
  return SpotifyApi.withAccessToken(config.client_id, stored);
}
