// Browser-only data layer. Everything runs client-side; there is no backend.
import { session } from './lib/session';
import { redirectUri, type Service } from './lib/config';
import { buildSpotifyAuthUrl, completeSpotifyLogin, logoutSpotify } from './lib/spotify/auth';
import { getTidalLoginUrl, finalizeTidalLogin } from './lib/tidal/auth';
import { dryRun, runSync as engineRunSync } from './lib/sync/engine';
import { loadSyncHistory, recordSync } from './lib/sync/history';

export type { Service } from './lib/config';
export type { AppCredentials, ServiceCredentials } from './lib/storage';
export type { SpotifyPlaylist, SpotifyTrack } from './lib/spotify/types';
export type { TidalPlaylist, TidalTrack } from './lib/tidal/types';
export type {
  Destination,
  SyncMapping,
  MatchedTrack,
  UnmatchedTrack,
  SourceMatchResult,
  SyncPlan,
  SyncRunResult,
} from './lib/sync/types';
export type { SyncHistory, SyncHistoryEntry } from './lib/sync/history';

import type { AppCredentials } from './lib/storage';
import { clearAllData as clearAllStorage } from './lib/storage';
import type { SyncMapping, SourceMatchResult, SyncPlan, SyncRunResult } from './lib/sync/types';

export interface ServiceStatus {
  connected: boolean;
  name?: string;
}
export interface Status {
  spotify: ServiceStatus;
  tidal: ServiceStatus;
}

// --- Status & credentials ---
export const getStatus = (): Promise<Status> => session.status();
export const getCredentials = async (): Promise<AppCredentials> => structuredClone(session.credentials);
export const saveCredentials = async (creds: Partial<AppCredentials>): Promise<void> => session.updateCredentials(creds);

// --- OAuth (PKCE, in-browser) ---
export async function getLoginUrl(service: Service): Promise<{ url: string }> {
  if (service === 'spotify') {
    const clientId = session.credentials.spotify.clientId;
    if (!clientId) throw new Error('Enter your Spotify Client ID first');
    return { url: await buildSpotifyAuthUrl(clientId) };
  }
  if (!session.credentials.tidal.clientId) throw new Error('Enter your TIDAL Client ID first');
  await session.ensureTidalInit();
  return { url: await getTidalLoginUrl(redirectUri()) };
}

/** Handle an OAuth redirect back to the app. Returns which service connected, or null if no code. */
export async function finishLoginRedirect(): Promise<Service | null> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) throw new Error(`Authorization failed (${params.get('error')})`);
  const code = params.get('code');
  if (!code) return null;
  if (params.get('state') === 'spotify') {
    await completeSpotifyLogin(session.credentials.spotify.clientId, code);
    return 'spotify';
  }
  await session.ensureTidalInit();
  await finalizeTidalLogin(window.location.search);
  return 'tidal';
}

export function disconnectSpotify(): void {
  logoutSpotify();
  session.spotify = undefined;
  session.spotifyName = undefined;
}

// --- Spotify library ---
export const getPlaylists = async () => ({ playlists: await (await session.requireSpotify()).getMyPlaylists() });
export const getPlaylistTracks = async (id: string) => ({ tracks: await (await session.requireSpotify()).getPlaylistTracks(id) });
export const getLikedCount = async () => ({ total: await (await session.requireSpotify()).getLikedCount() });
export const getLikedTracks = async () => ({ tracks: await (await session.requireSpotify()).getLikedTracks() });

// --- TIDAL library ---
export const getTidalPlaylists = async () => ({ playlists: await (await session.requireTidal()).getPlaylists() });
export const getTidalPlaylistTracks = async (id: string) => ({ tracks: await (await session.requireTidal()).getPlaylistTracks(id) });
export const getTidalFavorites = async () => ({ tracks: await (await session.requireTidal()).getFavoriteTracks() });

export async function getTidalTrack(id: string) {
  const track = await (await session.requireTidal()).getTrack(id);
  if (!track) throw new Error('Track not found on TIDAL');
  return { track };
}

/** Extract a TIDAL track id from a pasted link (or a bare numeric id). Returns null if not a track. */
export function parseTidalTrackId(input: string): string | null {
  const text = input.trim();
  if (/^\d+$/.test(text)) return text;
  const match = text.match(/(?:tidal\.com|listen\.tidal\.com)\/(?:browse\/)?track\/(\d+)/i);
  return match ? match[1]! : null;
}

// --- Match cache & history ---
export const clearMatchCache = async (): Promise<{ cleared: number }> => {
  const cleared = session.matchCache.size;
  session.matchCache.clear();
  return { cleared };
};

export const getSyncHistory = async () => loadSyncHistory();

/** Wipe all locally stored data (credentials, tokens, match cache, history). */
export const clearAllData = async (): Promise<{ cleared: number }> => {
  session.matchCache.clear();
  return { cleared: clearAllStorage() };
};

// --- Dry run & sync (progress via callbacks; no streaming protocol needed in-browser) ---
export interface DryRunHandlers {
  onMeta?: (meta: { sources: Array<{ name: string; total: number }>; total: number }) => void;
  onProgress?: (done: number, total: number) => void;
  onSourceDone?: (result: SourceMatchResult) => void;
}

export async function dryRunSync(mappings: SyncMapping[], handlers: DryRunHandlers = {}): Promise<SourceMatchResult[]> {
  const [spotify, tidal] = await Promise.all([session.requireSpotify(), session.requireTidal()]);
  return dryRun(spotify, tidal, mappings, session.matchCache, handlers);
}

export interface RunSyncHandlers {
  onMeta?: (meta: { plans: Array<{ name: string; total: number }>; total: number }) => void;
  onProgress?: (done: number, total: number) => void;
  onPlanDone?: (result: SyncRunResult) => void;
}

export async function runSync(plans: SyncPlan[], handlers: RunSyncHandlers = {}): Promise<SyncRunResult[]> {
  const [spotify, tidal] = await Promise.all([session.requireSpotify(), session.requireTidal()]);
  const syncedAt = new Date().toISOString();
  return engineRunSync(spotify, tidal, plans, {
    onMeta: handlers.onMeta,
    onProgress: handlers.onProgress,
    onPlanDone: (result) => {
      if (!result.error) {
        recordSync({
          sourceId: result.sourceId,
          sourceName: result.sourceName,
          destinationKind: result.destination.kind,
          tidalPlaylistId: result.playlistId,
          tidalPlaylistName: result.playlistName,
          added: result.added,
          total: result.requested,
          syncedAt,
        });
      }
      handlers.onPlanDone?.(result);
    },
  });
}
