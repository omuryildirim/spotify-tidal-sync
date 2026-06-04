/** Tiny typed wrapper around localStorage. All app keys are namespaced under `sts:`. */

const PREFIX = 'sts:';

export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setJSON(key: string, value: unknown): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function getString(key: string): string | null {
  return localStorage.getItem(PREFIX + key);
}

export function setString(key: string, value: string): void {
  localStorage.setItem(PREFIX + key, value);
}

export function remove(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

/** Public OAuth client ids the user entered (no secrets — this is a browser-only PKCE app). */
export interface ServiceCredentials {
  clientId: string;
}
export interface AppCredentials {
  spotify: ServiceCredentials;
  tidal: ServiceCredentials;
}

const EMPTY: AppCredentials = { spotify: { clientId: '' }, tidal: { clientId: '' } };

export function loadCredentials(): AppCredentials {
  const stored = getJSON<Partial<AppCredentials>>('credentials', {});
  return {
    spotify: { clientId: stored.spotify?.clientId ?? '' },
    tidal: { clientId: stored.tidal?.clientId ?? '' },
  };
}

export function saveCredentials(credentials: AppCredentials): void {
  setJSON('credentials', credentials);
}
