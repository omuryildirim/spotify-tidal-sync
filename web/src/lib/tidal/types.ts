/** Simplified TIDAL domain models used across the app (decoupled from the raw API shapes). */

export interface TidalTrack {
  id: string;
  title: string;
  artists: string[];
  isrc?: string;
  durationSeconds?: number;
  version?: string;
}

export interface TidalPlaylist {
  id: string;
  name: string;
  description?: string;
  numberOfItems?: number;
}

/** Abstraction over TIDAL so the sync engine never touches the raw API or auth details. */
export interface TidalClient {
  /** Country code used for catalog lookups. */
  readonly countryCode: string;

  /** Find tracks by ISRC (exact catalog match — primary strategy). */
  searchByIsrc(isrc: string): Promise<TidalTrack[]>;

  /** Batch ISRC lookup: returns a map from ISRC to the matching TIDAL tracks. */
  lookupIsrcs(isrcs: string[]): Promise<Map<string, TidalTrack[]>>;

  /** Free-text search fallback (e.g. "artist title"). */
  searchByText(query: string): Promise<TidalTrack[]>;

  /** Fetch a single track by its TIDAL id (used when the user pastes a track link). */
  getTrack(id: string): Promise<TidalTrack | null>;

  /** All playlists owned by the authenticated user. */
  getPlaylists(): Promise<TidalPlaylist[]>;

  /** All tracks currently in a playlist, in order. */
  getPlaylistTracks(playlistId: string): Promise<TidalTrack[]>;

  /** Create a new playlist and return it. */
  createPlaylist(name: string, description?: string): Promise<TidalPlaylist>;

  /** Append tracks (in order) to a playlist. `onChunk` reports tracks written so far. */
  addTracks(playlistId: string, trackIds: string[], onChunk?: (added: number) => void): Promise<void>;

  /**
   * Add tracks to the user's favorites ("collection"). `onChunk` reports tracks written so far.
   * `chunkSize` defaults to 1 (one request per track) to preserve order; a larger size is faster.
   */
  addFavoriteTracks(trackIds: string[], onChunk?: (added: number) => void, chunkSize?: number): Promise<void>;

  /** Remove every track from a playlist. */
  clearPlaylist(playlistId: string): Promise<void>;

  /** The user's favorite ("collection") tracks. */
  getFavoriteTracks(): Promise<TidalTrack[]>;
}

/** Parse an ISO-8601 duration (e.g. "PT3M20S") into whole seconds. */
export function parseIsoDuration(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return undefined;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
