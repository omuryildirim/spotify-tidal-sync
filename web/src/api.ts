export interface ServiceStatus {
  connected: boolean;
  name?: string;
}

export interface Status {
  spotify: ServiceStatus;
  tidal: ServiceStatus;
}

export interface ServiceCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AppCredentials {
  spotify: ServiceCredentials;
  tidal: ServiceCredentials;
}

export type Service = 'spotify' | 'tidal';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const getStatus = () => fetch('/api/status').then(json<Status>);
export const getCredentials = () => fetch('/api/credentials').then(json<AppCredentials>);

export const saveCredentials = (creds: Partial<AppCredentials>) =>
  fetch('/api/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  }).then(json<{ ok: boolean }>);

export const getLoginUrl = (service: Service) =>
  fetch(`/api/auth/${service}/login`).then(json<{ url: string }>);

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  ownerId: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  isrc?: string;
  durationMs: number;
  albumName?: string;
}

export const getPlaylists = () =>
  fetch('/api/playlists').then(json<{ playlists: SpotifyPlaylist[] }>);

export const getPlaylistTracks = (id: string) =>
  fetch(`/api/playlists/${id}/tracks`).then(json<{ tracks: SpotifyTrack[] }>);

export const getLikedCount = () => fetch('/api/spotify/liked').then(json<{ total: number }>);
export const getLikedTracks = () =>
  fetch('/api/spotify/liked/tracks').then(json<{ tracks: SpotifyTrack[] }>);

export interface TidalPlaylist {
  id: string;
  name: string;
  description?: string;
  numberOfItems?: number;
}

export interface TidalTrack {
  id: string;
  title: string;
  artists: string[];
  isrc?: string;
  durationSeconds?: number;
  version?: string;
}

export const getTidalPlaylists = () =>
  fetch('/api/tidal/playlists').then(json<{ playlists: TidalPlaylist[] }>);
export const getTidalPlaylistTracks = (id: string) =>
  fetch(`/api/tidal/playlists/${id}/tracks`).then(json<{ tracks: TidalTrack[] }>);
export const getTidalFavorites = () =>
  fetch('/api/tidal/favorites/tracks').then(json<{ tracks: TidalTrack[] }>);

export const getTidalTrack = (id: string) =>
  fetch(`/api/tidal/track/${id}`).then(json<{ track: TidalTrack }>);

/** Extract a TIDAL track id from a pasted link (or a bare numeric id). Returns null if not a track. */
export function parseTidalTrackId(input: string): string | null {
  const text = input.trim();
  if (/^\d+$/.test(text)) return text;
  const match = text.match(/(?:tidal\.com|listen\.tidal\.com)\/(?:browse\/)?track\/(\d+)/i);
  return match ? match[1]! : null;
}

/** A chosen Spotify source → TIDAL destination mapping (consumed by the sync step). */
export type Destination =
  | { kind: 'new' }
  | { kind: 'existing'; tidalId: string; tidalName: string }
  | { kind: 'favorites' };

export interface SyncMapping {
  sourceId: string;
  sourceName: string;
  sourceKind: 'playlist' | 'liked';
  destination: Destination;
}

export interface MatchedTrack {
  spotify: SpotifyTrack;
  tidal: TidalTrack;
  via: 'isrc' | 'name';
}

export interface UnmatchedTrack {
  spotify: SpotifyTrack;
  alternatives: TidalTrack[];
}

export interface SourceMatchResult {
  mapping: SyncMapping;
  total: number;
  matched: MatchedTrack[];
  unmatched: UnmatchedTrack[];
}

export const clearMatchCache = () =>
  fetch('/api/sync/cache/clear', { method: 'POST' }).then(json<{ cleared: number }>);

export interface SyncPlan {
  mapping: SyncMapping;
  tracks: Record<string, string>;
}

export interface SyncRunResult {
  sourceId: string;
  sourceName: string;
  destination: Destination;
  playlistId?: string;
  playlistName?: string;
  requested: number;
  added: number;
  alreadyPresent: number;
  error?: string;
}

export interface SyncHistoryEntry {
  sourceId: string;
  sourceName: string;
  destinationKind: 'new' | 'existing' | 'favorites';
  tidalPlaylistId?: string;
  tidalPlaylistName?: string;
  added: number;
  total: number;
  syncedAt: string;
}

export type SyncHistory = Record<string, SyncHistoryEntry>;

export const getSyncHistory = () => fetch('/api/sync/history').then(json<SyncHistory>);

/** Read a server NDJSON event stream, dispatching each event to `handle`. */
async function readNdjsonStream(res: Response, handle: (event: Record<string, unknown>) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) handle(JSON.parse(line) as Record<string, unknown>);
    }
  }
}

export interface RunSyncHandlers {
  onMeta?: (meta: { plans: Array<{ name: string; total: number }>; total: number }) => void;
  onProgress?: (done: number, total: number) => void;
  onPlanDone?: (result: SyncRunResult) => void;
}

/** Write confirmed plans to TIDAL, consuming the progress stream; resolves with per-plan results. */
export async function runSync(plans: SyncPlan[], handlers: RunSyncHandlers = {}): Promise<SyncRunResult[]> {
  const res = await fetch('/api/sync/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plans }),
  });
  const results: SyncRunResult[] = [];
  await readNdjsonStream(res, (event) => {
    if (event.type === 'meta') handlers.onMeta?.(event as never);
    else if (event.type === 'progress') handlers.onProgress?.(event.done as number, event.total as number);
    else if (event.type === 'plan-done') {
      results.push(event.result as SyncRunResult);
      handlers.onPlanDone?.(event.result as SyncRunResult);
    } else if (event.type === 'error') throw new Error(event.error as string);
  });
  return results;
}

export interface DryRunHandlers {
  onMeta?: (meta: { sources: Array<{ name: string; total: number }>; total: number }) => void;
  onProgress?: (done: number, total: number) => void;
  onSourceDone?: (result: SourceMatchResult) => void;
}

/**
 * Run a dry run, consuming the server's newline-delimited JSON progress stream.
 * Resolves with the full set of per-source results once matching completes.
 */
export async function dryRunSync(mappings: SyncMapping[], handlers: DryRunHandlers = {}): Promise<SourceMatchResult[]> {
  const res = await fetch('/api/sync/dry-run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mappings }),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Dry run failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const results: SourceMatchResult[] = [];
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as
        | { type: 'meta'; sources: Array<{ name: string; total: number }>; total: number }
        | { type: 'progress'; done: number; total: number }
        | { type: 'source-done'; result: SourceMatchResult }
        | { type: 'done' }
        | { type: 'error'; error: string };
      if (event.type === 'meta') handlers.onMeta?.({ sources: event.sources, total: event.total });
      else if (event.type === 'progress') handlers.onProgress?.(event.done, event.total);
      else if (event.type === 'source-done') {
        results.push(event.result);
        handlers.onSourceDone?.(event.result);
      } else if (event.type === 'error') throw new Error(event.error);
    }
  }
  return results;
}
