import { describe, it, expect } from 'vitest';
import { matchTrack, runSync } from './engine';
import type { TidalClient, TidalTrack } from '../tidal/types';
import type { SpotifyClient } from '../spotify/client';
import type { SpotifyTrack } from '../spotify/types';
import type { SyncPlan } from './types';

function spotify(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return { id: 's1', name: 'Uprising', artists: ['Muse'], durationMs: 304000, isrc: 'GBAHT0900320', ...overrides };
}

function tidal(overrides: Partial<TidalTrack> = {}): TidalTrack {
  return { id: 't1', title: 'Uprising', artists: ['Muse'], durationSeconds: 304, isrc: 'GBAHT0900320', ...overrides };
}

/** A TidalClient stub that records the text queries it was asked and replays canned results. */
function fakeClient(searchResults: Record<string, TidalTrack[]>): TidalClient & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    countryCode: 'US',
    async searchByIsrc() {
      return [];
    },
    async lookupIsrcs() {
      return new Map();
    },
    async getTrack() {
      return null;
    },
    async searchByText(query: string) {
      queries.push(query);
      return searchResults[query] ?? [];
    },
    async getPlaylists() {
      return [];
    },
    async getPlaylistTracks() {
      return [];
    },
    async createPlaylist() {
      return { id: 'p', name: 'p' };
    },
    async addTracks() {},
    async addFavoriteTracks() {},
    async clearPlaylist() {},
    async getFavoriteTracks() {
      return [];
    },
  };
}

describe('matchTrack', () => {
  it('matches via a pre-fetched ISRC hit without searching', async () => {
    const client = fakeClient({});
    const result = await matchTrack(client, spotify(), [tidal()]);
    expect(result.via).toBe('isrc');
    expect(result.tidal?.id).toBe('t1');
    expect(client.queries).toHaveLength(0);
  });

  it('falls back to a text search when there is no ISRC hit', async () => {
    const client = fakeClient({ 'Uprising Muse': [tidal({ isrc: 'OTHER' })] });
    const result = await matchTrack(client, spotify({ isrc: undefined }), []);
    expect(result.via).toBe('name');
    expect(result.tidal?.id).toBe('t1');
  });

  it('strips parenthetical suffixes and uses the primary artist for the first query', async () => {
    const client = fakeClient({});
    await matchTrack(client, spotify({ isrc: undefined, name: 'Bir Fırtına (Selanik)', artists: ['Şevval Sam', 'X'] }), []);
    expect(client.queries[0]).toBe('Bir Fırtına Şevval Sam');
  });

  it('tries the raw query as a fallback when the cleaned one finds nothing', async () => {
    const raw = 'Song (Live) Artist Other';
    const client = fakeClient({ [raw]: [tidal({ title: 'Song (Live)', artists: ['Artist'], isrc: 'Z' })] });
    const result = await matchTrack(
      client,
      spotify({ isrc: undefined, name: 'Song (Live)', artists: ['Artist', 'Other'], durationMs: 304000 }),
      [],
    );
    expect(client.queries).toContain(raw);
    expect(result.via).toBe('name');
  });

  it('returns deduped candidates as alternatives when nothing matches confidently', async () => {
    const candidate = tidal({ id: 'c1', title: 'Totally Different', artists: ['Nobody'], isrc: 'Q' });
    const client = fakeClient({ 'Hey Onbeşli Doğa': [candidate], 'Hey Onbeşli Doğa İçin Çal': [candidate] });
    const result = await matchTrack(
      client,
      spotify({ isrc: undefined, name: 'Hey Onbeşli', artists: ['Doğa', 'İçin Çal'] }),
      [],
    );
    expect(result.tidal).toBeUndefined();
    expect(result.alternatives.map((a) => a.id)).toEqual(['c1']);
  });
});

/** A SpotifyClient stub that returns a fixed playlist track list. */
function fakeSpotify(tracks: SpotifyTrack[]): SpotifyClient {
  return { getPlaylistTracks: async () => tracks, getLikedTracks: async () => tracks } as unknown as SpotifyClient;
}

/** A TidalClient stub for writes that records what addTracks received. */
function writeClient(existingInPlaylist: string[] = [], existingFavorites: string[] = []) {
  const adds: string[][] = [];
  const favAdds: string[][] = [];
  const client = {
    countryCode: 'US',
    async createPlaylist(name: string) {
      return { id: 'new-pl', name };
    },
    async addTracks(_id: string, ids: string[]) {
      adds.push(ids);
    },
    async addFavoriteTracks(ids: string[]) {
      favAdds.push(ids);
    },
    async getPlaylistTracks() {
      return existingInPlaylist.map((id) => ({ id, title: id, artists: [] }));
    },
    async getFavoriteTracks() {
      return existingFavorites.map((id) => ({ id, title: id, artists: [] }));
    },
  } as unknown as TidalClient;
  return { client, adds, favAdds };
}

function src(id: string): SpotifyTrack {
  return { id, name: id, artists: ['x'], durationMs: 1000 };
}

describe('runSync order + duplicates', () => {
  // Three distinct Spotify entries, two of which matched the same TIDAL track (A).
  const sourceTracks = [src('s1'), src('s2'), src('s3')];
  const plan = (destination: SyncPlan['mapping']['destination']): SyncPlan => ({
    mapping: { sourceId: 'p', sourceName: 'P', sourceKind: 'playlist', destination },
    tracks: { s1: 'A', s2: 'B', s3: 'A' },
  });

  it('mirrors Spotify exactly for a new playlist, keeping duplicates in order', async () => {
    const { client, adds } = writeClient();
    const [result] = await runSync(fakeSpotify(sourceTracks), client, [plan({ kind: 'new' })]);
    expect(adds.flat()).toEqual(['A', 'B', 'A']); // duplicate preserved, in source order
    expect(result!.added).toBe(3);
  });

  it('appends only missing, de-duped, for an existing playlist', async () => {
    const { client, adds } = writeClient(['B']); // B already there
    const [result] = await runSync(fakeSpotify(sourceTracks), client, [
      plan({ kind: 'existing', tidalId: 'dest', tidalName: 'Dest' }),
    ]);
    expect(adds.flat()).toEqual(['A']); // B present, second A de-duped
    expect(result!.added).toBe(1);
    expect(result!.alreadyPresent).toBe(1);
  });

  it('adds favorites de-duped, skipping already-favorited', async () => {
    const { client, favAdds } = writeClient([], ['A']); // A already favorited
    const [result] = await runSync(fakeSpotify(sourceTracks), client, [plan({ kind: 'favorites' })]);
    expect(favAdds.flat()).toEqual(['B']); // A favorited already, dupes collapsed
    expect(result!.added).toBe(1);
  });
});
