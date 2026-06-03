import type { SpotifyTrack } from '../spotify/types.js';
import type { TidalTrack } from '../tidal/types.js';

/** Where a Spotify source should land on TIDAL. */
export type Destination =
  | { kind: 'new' }
  | { kind: 'existing'; tidalId: string; tidalName: string }
  | { kind: 'favorites' };

/** A chosen Spotify source → TIDAL destination, as picked in the library browser. */
export interface SyncMapping {
  sourceId: string;
  sourceName: string;
  sourceKind: 'playlist' | 'liked';
  destination: Destination;
}

/** A Spotify track that found a TIDAL counterpart. */
export interface MatchedTrack {
  spotify: SpotifyTrack;
  tidal: TidalTrack;
  via: 'isrc' | 'name';
}

/** A Spotify track with no confident match, plus the closest candidates to choose from. */
export interface UnmatchedTrack {
  spotify: SpotifyTrack;
  alternatives: TidalTrack[];
}

/** The dry-run match outcome for a single source → destination mapping. */
export interface SourceMatchResult {
  mapping: SyncMapping;
  total: number;
  matched: MatchedTrack[];
  unmatched: UnmatchedTrack[];
}

/**
 * A confirmed plan to write one source to TIDAL. `tracks` maps each Spotify track id to the TIDAL
 * track id it should become (matched tracks + user-resolved picks); tracks to skip are simply absent.
 * The server re-fetches the Spotify source to recover the authoritative order.
 */
export interface SyncPlan {
  mapping: SyncMapping;
  tracks: Record<string, string>;
}

/** The outcome of writing one plan to TIDAL. */
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
