import { SPOTIFY_SCOPES, redirectUri } from '../config';
import { getJSON, setJSON, getString, setString, remove } from '../storage';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires: number; // epoch ms
}

const TOKEN_KEY = 'spotify:token';
const VERIFIER_KEY = 'spotify:pkce_verifier';

const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Build the PKCE authorize URL and stash the verifier for the callback. */
export async function buildSpotifyAuthUrl(clientId: string): Promise<string> {
  const verifier = randomVerifier();
  setString(VERIFIER_KEY, verifier);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challenge(verifier),
    state: 'spotify',
  }).toString();
  return url.toString();
}

function store(token: { access_token: string; refresh_token?: string; expires_in: number }, prev?: StoredToken): StoredToken {
  const stored: StoredToken = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? prev?.refresh_token,
    expires: Date.now() + token.expires_in * 1000,
  };
  setJSON(TOKEN_KEY, stored);
  return stored;
}

/** Exchange the authorization code (from the callback) for tokens. */
export async function completeSpotifyLogin(clientId: string, code: string): Promise<void> {
  const verifier = getString(VERIFIER_KEY);
  if (!verifier) throw new Error('Missing PKCE verifier — please start the Spotify login again.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  store((await res.json()) as { access_token: string; refresh_token?: string; expires_in: number });
  remove(VERIFIER_KEY);
}

async function refresh(clientId: string, stored: StoredToken): Promise<StoredToken> {
  if (!stored.refresh_token) throw new Error('No Spotify refresh token');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
      client_id: clientId,
    }),
  });
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`);
  return store((await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }, stored);
}

export function hasStoredSpotifyToken(): boolean {
  const stored = getJSON<StoredToken | null>(TOKEN_KEY, null);
  return Boolean(stored && (stored.expires > Date.now() + 60_000 || stored.refresh_token));
}

export function logoutSpotify(): void {
  remove(TOKEN_KEY);
}

/** Return a valid access token, refreshing if it is near expiry. Throws if not logged in. */
export async function getSpotifyAccessToken(clientId: string): Promise<string> {
  let stored = getJSON<StoredToken | null>(TOKEN_KEY, null);
  if (!stored) throw new Error('Not logged in to Spotify');
  if (stored.expires <= Date.now() + 60_000 && stored.refresh_token) {
    stored = await refresh(clientId, stored);
  }
  return stored.access_token;
}
