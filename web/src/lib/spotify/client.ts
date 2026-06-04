import type { SpotifyTrack, SpotifyPlaylist } from './types';

const PAGE_LIMIT = 50;

/** Returns a currently-valid Spotify access token (refreshing under the hood as needed). */
export type TokenProvider = () => Promise<string>;

/** Raw Spotify track object (as returned under either `track` or `item`). */
interface RawTrack {
  id: string | null;
  type?: string;
  name: string;
  duration_ms: number;
  external_ids?: { isrc?: string };
  artists?: Array<{ name: string }>;
  album?: { name?: string };
}

function mapTrack(track: RawTrack | null | undefined): SpotifyTrack | null {
  if (!track || (track.type && track.type !== 'track') || !track.id) return null;
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists ?? []).map((a) => a.name),
    isrc: track.external_ids?.isrc,
    durationMs: track.duration_ms,
    albumName: track.album?.name,
  };
}

/** Raw Spotify playlist object (fields we read from /me/playlists). */
interface RawPlaylist {
  id: string;
  name: string;
  description?: string | null;
  owner?: { id?: string };
  tracks?: { total?: number };
  items?: { total?: number };
}

/** Thin wrapper exposing only what the sync engine needs from Spotify (fetch-only, browser-safe). */
export class SpotifyClient {
  private myIdPromise?: Promise<string>;

  constructor(private readonly getToken: TokenProvider) {}

  async currentUserId(): Promise<string> {
    this.myIdPromise ??= this.raw<{ id: string }>('/me').then((p) => p.id);
    return this.myIdPromise;
  }

  /** GET a Spotify Web API path with a fresh bearer token. */
  private async raw<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${await this.getToken()}` },
    });
    if (!res.ok) throw new Error(`Spotify ${path} → ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /** All playlists owned by the current user (excludes followed/others'). */
  async getMyPlaylists(): Promise<SpotifyPlaylist[]> {
    const myId = await this.currentUserId();
    const out: SpotifyPlaylist[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.raw<{ next: string | null; items: RawPlaylist[] }>(
        `/me/playlists?limit=${PAGE_LIMIT}&offset=${offset}`,
      );
      for (const pl of page.items) {
        if (!pl || pl.owner?.id !== myId) continue;
        // Spotify exposes the count under `tracks` on older responses and `items` on newer ones.
        const count = pl.tracks?.total ?? pl.items?.total ?? 0;
        out.push({
          id: pl.id,
          name: pl.name,
          description: pl.description ?? undefined,
          trackCount: count,
          ownerId: pl.owner?.id ?? myId,
        });
      }
      if (!page.next) break;
    }
    return out;
  }

  /** All playable tracks in a playlist, in order (skips local files, episodes and removed items). */
  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    // This account's API exposes playlist contents at /items (not the legacy /tracks, which 403s),
    // with each entry nested under `item` (older responses use `track`); request both for safety.
    const trackFields = 'name,duration_ms,id,type,external_ids(isrc),artists(name),album(name)';
    const fields = encodeURIComponent(`next,items(item(${trackFields}),track(${trackFields}))`);
    const out: SpotifyTrack[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.raw<{ next: string | null; items: Array<{ track?: RawTrack; item?: RawTrack }> }>(
        `/playlists/${playlistId}/items?limit=${PAGE_LIMIT}&offset=${offset}&fields=${fields}`,
      );
      for (const item of page.items) {
        const mapped = mapTrack(item.item ?? item.track);
        if (mapped) out.push(mapped);
      }
      if (!page.next) break;
    }
    return out;
  }

  /** Total number of "Liked Songs" (cheap — reads only the paging total). */
  async getLikedCount(): Promise<number> {
    const page = await this.raw<{ total: number }>('/me/tracks?limit=1');
    return page.total;
  }

  /** The current user's "Liked Songs", oldest first (to match Tidal favorite ordering). */
  async getLikedTracks(): Promise<SpotifyTrack[]> {
    const out: SpotifyTrack[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await this.raw<{ next: string | null; items: Array<{ track?: RawTrack; item?: RawTrack }> }>(
        `/me/tracks?limit=${PAGE_LIMIT}&offset=${offset}`,
      );
      for (const item of page.items) {
        const mapped = mapTrack(item.track ?? item.item);
        if (mapped) out.push(mapped);
      }
      if (!page.next) break;
    }
    out.reverse();
    return out;
  }
}
