/** Simplified Spotify domain models used by the matcher and sync engine. */

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  isrc?: string;
  durationMs: number;
  albumName?: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  ownerId: string;
}
