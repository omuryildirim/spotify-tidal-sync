import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { SpotifyClient } from '../spotify/client.js';
import { openSpotifySession, hasStoredSpotifyToken } from '../spotify/auth.js';
import { OfficialTidalClient } from '../tidal/client.js';
import { initTidalAuth, hasValidSession } from '../tidal/auth.js';
import { loadCredentials, saveCredentials, type AppCredentials } from '../util/credentials-store.js';
import { withTimeout } from '../util/timeout.js';
import { SPOTIFY_REDIRECT_URI } from './config.js';
import type { MatchCache } from '../sync/engine.js';

export interface ConnectionState {
  connected: boolean;
  name?: string;
}

/**
 * In-memory, single-user session for the local server: holds entered credentials and the
 * live API clients. Tokens themselves persist to disk via the auth modules.
 */
class Session {
  credentials: AppCredentials = loadCredentials();
  spotify?: SpotifyClient;
  spotifyName?: string;
  tidal?: OfficialTidalClient;
  /** Per-track match results, reused across dry runs within this session. */
  matchCache: MatchCache = new Map();
  private tidalInitialized = false;

  updateCredentials(patch: Partial<AppCredentials>): void {
    this.credentials = {
      spotify: { ...this.credentials.spotify, ...patch.spotify },
      tidal: { ...this.credentials.tidal, ...patch.tidal },
    };
    saveCredentials(this.credentials);
  }

  spotifyConfig() {
    return {
      client_id: this.credentials.spotify.clientId,
      client_secret: this.credentials.spotify.clientSecret,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    };
  }

  /** Ensure the TIDAL auth module is initialized with the current client credentials. */
  async ensureTidalInit(): Promise<void> {
    if (this.tidalInitialized) return;
    if (!this.credentials.tidal.clientId) throw new Error('TIDAL client ID not set');
    await initTidalAuth(this.credentials.tidal.clientId, this.credentials.tidal.clientSecret);
    this.tidalInitialized = true;
  }

  /** Build the Spotify client from a stored token (no-op if already built). */
  async loadSpotify(): Promise<void> {
    if (this.spotify || !hasStoredSpotifyToken() || !this.credentials.spotify.clientId) return;
    const api = await openSpotifySession(this.spotifyConfig());
    this.spotify = new SpotifyClient(api);
    this.spotifyName = (await api.currentUser.profile()).display_name;
  }

  /** Build the TIDAL client if a valid user session exists (no-op if already built). */
  async loadTidal(): Promise<void> {
    if (this.tidal || !this.credentials.tidal.clientId) return;
    await this.ensureTidalInit();
    if (await hasValidSession()) {
      this.tidal = await OfficialTidalClient.create();
    }
  }

  async status(): Promise<{ spotify: ConnectionState; tidal: ConnectionState }> {
    const results = await Promise.allSettled([
      withTimeout(this.loadSpotify(), 12_000, 'Load Spotify'),
      withTimeout(this.loadTidal(), 12_000, 'Load TIDAL'),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[status] ${i === 0 ? 'spotify' : 'tidal'} load failed:`, r.reason);
    });
    return {
      spotify: { connected: Boolean(this.spotify), name: this.spotifyName },
      tidal: { connected: Boolean(this.tidal), name: this.tidal?.profileName },
    };
  }

  /** Ensure the Spotify client is built (from a stored token) and return it, or throw. */
  async requireSpotify(): Promise<SpotifyClient> {
    await this.loadSpotify();
    if (!this.spotify) throw new Error('Spotify not connected');
    return this.spotify;
  }

  /** Ensure the TIDAL client is built (from a stored session) and return it, or throw. */
  async requireTidal(): Promise<OfficialTidalClient> {
    await this.loadTidal();
    if (!this.tidal) throw new Error('TIDAL not connected');
    return this.tidal;
  }
}

export const session = new Session();
export { SpotifyApi };
