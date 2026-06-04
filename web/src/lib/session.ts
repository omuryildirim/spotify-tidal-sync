import { SpotifyClient } from './spotify/client';
import { getSpotifyAccessToken, hasStoredSpotifyToken } from './spotify/auth';
import { OfficialTidalClient } from './tidal/client';
import { initTidalAuth, hasValidSession } from './tidal/auth';
import { loadCredentials, saveCredentials, type AppCredentials } from './storage';
import type { MatchCache } from './sync/engine';

export interface ConnectionState {
  connected: boolean;
  name?: string;
}

/** Holds the user's public client ids and the live API clients, all in the browser. */
class Session {
  credentials: AppCredentials = loadCredentials();
  spotify?: SpotifyClient;
  spotifyName?: string;
  tidal?: OfficialTidalClient;
  matchCache: MatchCache = new Map();
  private tidalInitialized = false;

  updateCredentials(patch: Partial<AppCredentials>): void {
    this.credentials = {
      spotify: { ...this.credentials.spotify, ...patch.spotify },
      tidal: { ...this.credentials.tidal, ...patch.tidal },
    };
    saveCredentials(this.credentials);
  }

  async ensureTidalInit(): Promise<void> {
    if (this.tidalInitialized) return;
    if (!this.credentials.tidal.clientId) throw new Error('TIDAL client ID not set');
    await initTidalAuth(this.credentials.tidal.clientId);
    this.tidalInitialized = true;
  }

  /** Build the Spotify client from a stored token (no-op if already built). */
  async loadSpotify(): Promise<void> {
    const clientId = this.credentials.spotify.clientId;
    if (this.spotify || !hasStoredSpotifyToken() || !clientId) return;
    const client = new SpotifyClient(() => getSpotifyAccessToken(clientId));
    const profile = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${await getSpotifyAccessToken(clientId)}` },
    }).then((r) => (r.ok ? (r.json() as Promise<{ display_name?: string; id: string }>) : null));
    this.spotify = client;
    this.spotifyName = profile?.display_name ?? profile?.id;
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
    const results = await Promise.allSettled([this.loadSpotify(), this.loadTidal()]);
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[status] ${i === 0 ? 'spotify' : 'tidal'} load failed:`, r.reason);
    });
    return {
      spotify: { connected: Boolean(this.spotify), name: this.spotifyName },
      tidal: { connected: Boolean(this.tidal), name: this.tidal?.profileName },
    };
  }

  async requireSpotify(): Promise<SpotifyClient> {
    await this.loadSpotify();
    if (!this.spotify) throw new Error('Spotify not connected');
    return this.spotify;
  }

  async requireTidal(): Promise<OfficialTidalClient> {
    await this.loadTidal();
    if (!this.tidal) throw new Error('TIDAL not connected');
    return this.tidal;
  }
}

export const session = new Session();
