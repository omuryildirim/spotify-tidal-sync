import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

export interface SpotifyConfig {
  client_id: string;
  client_secret: string;
  /** Must match a Redirect URI registered on the Spotify app. Default: http://127.0.0.1:8888/callback */
  redirect_uri?: string;
  /** Optional, retained for compatibility with the Python config. */
  username?: string;
}

export interface TidalConfig {
  /** Client ID of the app registered at https://developer.tidal.com */
  client_id: string;
  /** Client secret, required for confidential clients (those issued a secret). */
  client_secret?: string;
  /** Must match a Redirect URI registered on the TIDAL app. Default: http://localhost:8989/callback */
  redirect_uri?: string;
}

export interface PlaylistMappingConfig {
  spotify_id: string;
  tidal_id: string;
}

export interface AppConfig {
  spotify: SpotifyConfig;
  tidal: TidalConfig;
  sync_playlists?: PlaylistMappingConfig[];
  excluded_playlists?: string[];
  sync_favorites_default?: boolean;
}

const DEFAULT_SPOTIFY_REDIRECT = 'http://127.0.0.1:8888/callback';
const DEFAULT_TIDAL_REDIRECT = 'http://localhost:8989/callback';

class ConfigError extends Error {}

function requireField<T>(value: T | undefined, path: string): T {
  if (value === undefined || value === null || value === '') {
    throw new ConfigError(`Missing required config field: ${path}`);
  }
  return value;
}

export function loadConfig(path = 'config.yml'): AppConfig {
  let raw: unknown;
  try {
    raw = load(readFileSync(path, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(
        `Config file not found at '${path}'. Copy example_config.yml to config.yml and fill it in.`,
      );
    }
    throw err;
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError(`Config file '${path}' is empty or malformed.`);
  }
  const obj = raw as Record<string, unknown>;
  const spotify = (obj.spotify ?? {}) as Partial<SpotifyConfig>;
  const tidal = (obj.tidal ?? {}) as Partial<TidalConfig>;

  return {
    spotify: {
      client_id: requireField(spotify.client_id, 'spotify.client_id'),
      client_secret: requireField(spotify.client_secret, 'spotify.client_secret'),
      redirect_uri: spotify.redirect_uri ?? DEFAULT_SPOTIFY_REDIRECT,
      username: spotify.username,
    },
    tidal: {
      client_id: requireField(tidal.client_id, 'tidal.client_id'),
      client_secret: tidal.client_secret,
      redirect_uri: tidal.redirect_uri ?? DEFAULT_TIDAL_REDIRECT,
    },
    sync_playlists: (obj.sync_playlists as PlaylistMappingConfig[] | undefined) ?? undefined,
    excluded_playlists: (obj.excluded_playlists as string[] | undefined) ?? undefined,
    sync_favorites_default: (obj.sync_favorites_default as boolean | undefined) ?? true,
  };
}

export { ConfigError };
