import { createTidalApiClient } from './auth';
import { type TidalClient, type TidalTrack, type TidalPlaylist, parseIsoDuration } from './types';

type Api = ReturnType<typeof createTidalApiClient>;

/** Minimal JSON:API resource shapes we read from responses. */
interface JsonResource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: Array<{ id: string; type: string }> | { id: string; type: string } }>;
  meta?: { itemId?: string };
}
interface JsonDoc {
  data?: JsonResource | JsonResource[];
  included?: JsonResource[];
  links?: { next?: string; meta?: { nextCursor?: string } };
}

const TRACKS_PER_ADD = 20;
/** How many ISRCs to resolve in a single /tracks request (TIDAL accepts a multi-valued filter). */
const ISRCS_PER_LOOKUP = 20;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function asArray(data: JsonDoc['data']): JsonResource[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function buildArtistMap(included: JsonResource[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const res of included ?? []) {
    if (res.type === 'artists' && typeof res.attributes?.name === 'string') {
      map.set(res.id, res.attributes.name);
    }
  }
  return map;
}

/** Turn a track resource (with attributes) into a TidalTrack, resolving artist names from the map. */
function toTrack(res: JsonResource, artistMap: Map<string, string>): TidalTrack {
  const rel = res.relationships?.artists?.data;
  const refs = Array.isArray(rel) ? rel : rel ? [rel] : [];
  const artists = refs.map((r) => artistMap.get(r.id)).filter((n): n is string => Boolean(n));
  return {
    id: res.id,
    title: String(res.attributes?.title ?? ''),
    artists,
    isrc: typeof res.attributes?.isrc === 'string' ? res.attributes.isrc : undefined,
    durationSeconds: parseIsoDuration(res.attributes?.duration as string | undefined),
    version: typeof res.attributes?.version === 'string' ? res.attributes.version : undefined,
  };
}

/** Map endpoints that return track resources directly in `data` (e.g. /tracks search). */
function mapDataTracks(doc: JsonDoc): TidalTrack[] {
  const artistMap = buildArtistMap(doc.included);
  return asArray(doc.data)
    .filter((r) => r.type === 'tracks')
    .map((r) => toTrack(r, artistMap));
}

/** Resolve an ordered list of track refs against the resources in `included`. */
function resolveTrackRefs(refs: Array<{ id: string; type: string }>, doc: JsonDoc): TidalTrack[] {
  const artistMap = buildArtistMap(doc.included);
  const byId = new Map((doc.included ?? []).filter((r) => r.type === 'tracks').map((r) => [r.id, r]));
  return refs
    .filter((ref) => ref.type === 'tracks')
    .map((ref) => byId.get(ref.id))
    .filter((r): r is JsonResource => Boolean(r))
    .map((r) => toTrack(r, artistMap));
}

/** Map relationship endpoints where `data` holds ordered refs and `included` holds the resources. */
function mapIncludedTracks(doc: JsonDoc): TidalTrack[] {
  return resolveTrackRefs(asArray(doc.data), doc);
}

/**
 * Map a `/searchResults/{id}` response, whose single `data` resource exposes ordered track
 * refs under `relationships.tracks.data` (the matching resources live in `included`).
 */
function mapSearchResultTracks(doc: JsonDoc): TidalTrack[] {
  const result = Array.isArray(doc.data) ? doc.data[0] : doc.data;
  const rel = result?.relationships?.tracks?.data;
  const refs = Array.isArray(rel) ? rel : rel ? [rel] : [];
  return resolveTrackRefs(refs, doc);
}

type RelationshipPath =
  | '/userCollections/{id}/relationships/playlists'
  | '/playlists/{id}/relationships/items'
  | '/userCollections/{id}/relationships/tracks';

export class OfficialTidalClient implements TidalClient {
  private constructor(
    private readonly api: Api,
    readonly countryCode: string,
    private readonly userId: string,
    readonly profileName: string,
  ) {}

  /** Build a client, resolving the authenticated user's id + country code. */
  static async create(): Promise<OfficialTidalClient> {
    const api = createTidalApiClient();
    const { data, error } = await api.GET('/users/{id}', { params: { path: { id: 'me' } } });
    if (error || !data) {
      throw new Error('Could not load the authenticated TIDAL user. Try logging in again.');
    }
    const me = (data as JsonDoc).data as JsonResource | undefined;
    const userId = me?.id ?? 'me';
    const attrs = me?.attributes ?? {};
    const countryCode = (attrs.country as string | undefined) ?? 'US';
    const profileName =
      [attrs.username, attrs.firstName, attrs.email].find((v): v is string => typeof v === 'string' && v.length > 0) ??
      `user ${userId}`;
    return new OfficialTidalClient(api, countryCode, userId, profileName);
  }

  async searchByIsrc(isrc: string): Promise<TidalTrack[]> {
    const data = await this.getWithRetry(
      () =>
        this.api.GET('/tracks', {
          params: { query: { countryCode: this.countryCode, 'filter[isrc]': [isrc], include: ['artists'] } },
        }),
      `ISRC search ${isrc}`,
    );
    return data ? mapDataTracks(data as JsonDoc) : [];
  }

  async lookupIsrcs(isrcs: string[]): Promise<Map<string, TidalTrack[]>> {
    const map = new Map<string, TidalTrack[]>();
    const unique = [...new Set(isrcs.filter(Boolean))];
    for (let i = 0; i < unique.length; i += ISRCS_PER_LOOKUP) {
      const chunk = unique.slice(i, i + ISRCS_PER_LOOKUP);
      const data = await this.getWithRetry(
        () =>
          this.api.GET('/tracks', {
            params: { query: { countryCode: this.countryCode, 'filter[isrc]': chunk, include: ['artists'] } },
          }),
        `ISRC batch (${chunk.length})`,
      );
      for (const track of data ? mapDataTracks(data as JsonDoc) : []) {
        if (!track.isrc) continue;
        const arr = map.get(track.isrc);
        if (arr) arr.push(track);
        else map.set(track.isrc, [track]);
      }
    }
    return map;
  }

  async getTrack(id: string): Promise<TidalTrack | null> {
    const data = await this.getWithRetry(
      () =>
        this.api.GET('/tracks/{id}', {
          params: { path: { id }, query: { countryCode: this.countryCode, include: ['artists'] } },
        }),
      `track ${id}`,
    );
    return data ? (mapDataTracks(data as JsonDoc)[0] ?? null) : null;
  }

  async searchByText(query: string): Promise<TidalTrack[]> {
    const data = await this.getWithRetry(
      () =>
        this.api.GET('/searchResults/{id}', {
          params: { path: { id: query }, query: { countryCode: this.countryCode, include: ['tracks', 'tracks.artists'] } },
        }),
      `search "${query}"`,
    );
    return data ? mapSearchResultTracks(data as JsonDoc) : [];
  }

  /** Convenience: run a GET through {@link withRetry} and return just the body (undefined on failure). */
  private async getWithRetry(
    call: () => Promise<{ data?: unknown; error?: unknown; response?: Response }>,
    label: string,
  ): Promise<unknown> {
    return (await this.withRetry(call, label)).data;
  }

  /**
   * Run a request, retrying on rate-limit (429) and transient (408/5xx) responses with exponential
   * backoff (honoring `Retry-After`). Returns the final attempt's result so callers can read the
   * body (reads) or check `error` (writes).
   *
   * Crucially we retry on the HTTP *status*, not on `error`: TIDAL's search endpoint returns a 429
   * with an empty body, which openapi-fetch surfaces as a success-shaped result (no `error` set),
   * so keying off `error` alone silently dropped throttled lookups.
   */
  private async withRetry<T extends { data?: unknown; error?: unknown; response?: Response }>(
    call: () => Promise<T>,
    label: string,
  ): Promise<T> {
    const MAX_ATTEMPTS = 6;
    const isRetryable = (status?: number) =>
      status === 429 || status === 408 || (status !== undefined && status >= 500);
    let result = await call();
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt++) {
      const status = result.response?.status;
      if (!result.error && !isRetryable(status)) break; // genuine success
      if (result.error && !isRetryable(status)) break; // permanent failure (e.g. 400/404)
      const retryAfter = Number(result.response?.headers.get('retry-after'));
      // Exponential backoff with jitter, so concurrent callers don't retry in lockstep.
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 400 * 2 ** attempt);
      await sleep(backoff + Math.floor(Math.random() * 250));
      result = await call();
    }
    const status = result.response?.status;
    if ((result.error || isRetryable(status)) && status !== 404) console.warn(`[tidal] ${label} failed (${status})`);
    return result;
  }

  async getPlaylists(): Promise<TidalPlaylist[]> {
    const playlists: TidalPlaylist[] = [];
    for await (const doc of this.paginate('/userCollections/{id}/relationships/playlists', {
      path: { id: this.userId },
      query: { countryCode: this.countryCode, include: ['playlists'] },
    })) {
      for (const res of (doc.included ?? []).filter((r) => r.type === 'playlists')) {
        playlists.push({
          id: res.id,
          name: String(res.attributes?.name ?? ''),
          description: res.attributes?.description as string | undefined,
          numberOfItems: res.attributes?.numberOfItems as number | undefined,
        });
      }
    }
    return playlists;
  }

  async getPlaylistTracks(playlistId: string): Promise<TidalTrack[]> {
    const tracks: TidalTrack[] = [];
    for await (const doc of this.paginate('/playlists/{id}/relationships/items', {
      path: { id: playlistId },
      query: { countryCode: this.countryCode, include: ['items', 'items.artists'] },
    })) {
      tracks.push(...mapIncludedTracks(doc));
    }
    return tracks;
  }

  async createPlaylist(name: string, description?: string): Promise<TidalPlaylist> {
    const { data, error } = await this.withRetry(
      () =>
        this.api.POST('/playlists', {
          params: { query: { countryCode: this.countryCode } },
          body: {
            data: {
              type: 'playlists',
              attributes: { name, description: description ?? '', accessType: 'UNLISTED' },
            },
          },
        }),
      `create playlist "${name}"`,
    );
    if (error || !data) throw new Error(`Failed to create TIDAL playlist "${name}"`);
    const res = (data as JsonDoc).data as JsonResource;
    return { id: res.id, name, description, numberOfItems: 0 };
  }

  /**
   * Append tracks to a playlist in chunks, preserving order. `onChunk` reports how many tracks
   * have been written so far (for live progress). Throws if any chunk ultimately fails.
   */
  async addTracks(playlistId: string, trackIds: string[], onChunk?: (added: number) => void): Promise<void> {
    for (let i = 0; i < trackIds.length; i += TRACKS_PER_ADD) {
      const chunk = trackIds.slice(i, i + TRACKS_PER_ADD);
      const { error } = await this.withRetry(
        () =>
          this.api.POST('/playlists/{id}/relationships/items', {
            params: { path: { id: playlistId }, query: { countryCode: this.countryCode } },
            body: { data: chunk.map((id) => ({ id, type: 'tracks' as const })) },
          }),
        `add ${chunk.length} tracks to ${playlistId}`,
      );
      if (error) throw new Error(`Failed to add tracks to playlist ${playlistId}`);
      onChunk?.(Math.min(i + chunk.length, trackIds.length));
    }
  }

  /**
   * Add tracks to the user's favorites ("collection"). `onChunk` reports progress.
   *
   * Favorites have no manual ordering — TIDAL sorts the collection by date added — so by default we
   * add one track per request (`chunkSize` 1): each gets a distinct, increasing timestamp that
   * mirrors the Spotify order (visible when sorting the collection by "Date added"). Passing a larger
   * `chunkSize` is faster but collides timestamps within a batch, so the order is not preserved.
   */
  async addFavoriteTracks(trackIds: string[], onChunk?: (added: number) => void, chunkSize = 1): Promise<void> {
    const size = Math.max(1, chunkSize);
    for (let i = 0; i < trackIds.length; i += size) {
      const chunk = trackIds.slice(i, i + size);
      const { error } = await this.withRetry(
        () =>
          this.api.POST('/userCollections/{id}/relationships/tracks', {
            params: { path: { id: this.userId }, query: { countryCode: this.countryCode } },
            body: { data: chunk.map((id) => ({ id, type: 'tracks' as const })) },
          }),
        `favorite ${chunk.length} track(s)`,
      );
      if (error) throw new Error('Failed to add tracks to favorites');
      onChunk?.(Math.min(i + chunk.length, trackIds.length));
    }
  }

  async clearPlaylist(playlistId: string): Promise<void> {
    const refs = await this.getPlaylistItemRefs(playlistId);
    for (let i = 0; i < refs.length; i += TRACKS_PER_ADD) {
      const chunk = refs.slice(i, i + TRACKS_PER_ADD);
      const { error } = await this.api.DELETE('/playlists/{id}/relationships/items', {
        params: { path: { id: playlistId } },
        body: {
          data: chunk.map((r) => ({ id: r.trackId, type: 'tracks' as const, meta: { itemId: r.itemId } })),
        },
      });
      if (error) throw new Error(`Failed to clear playlist ${playlistId}`);
    }
  }

  private async getPlaylistItemRefs(playlistId: string): Promise<Array<{ trackId: string; itemId: string }>> {
    const refs: Array<{ trackId: string; itemId: string }> = [];
    for await (const doc of this.paginate('/playlists/{id}/relationships/items', {
      path: { id: playlistId },
      query: { countryCode: this.countryCode },
    })) {
      for (const ref of asArray(doc.data)) {
        if (ref.meta?.itemId) refs.push({ trackId: ref.id, itemId: ref.meta.itemId });
      }
    }
    return refs;
  }

  async getFavoriteTracks(): Promise<TidalTrack[]> {
    const tracks: TidalTrack[] = [];
    for await (const doc of this.paginate('/userCollections/{id}/relationships/tracks', {
      path: { id: this.userId },
      query: { countryCode: this.countryCode, include: ['tracks', 'tracks.artists'] },
    })) {
      tracks.push(...mapIncludedTracks(doc));
    }
    return tracks;
  }

  /** Walk JSON:API cursor pagination, yielding each page document. */
  private async *paginate(
    path: RelationshipPath,
    params: { path: Record<string, string>; query: Record<string, unknown> },
  ): AsyncGenerator<JsonDoc> {
    let cursor: string | undefined;
    do {
      const query = { ...params.query, ...(cursor ? { 'page[cursor]': cursor } : {}) };
      // @ts-expect-error path is a constrained union; openapi-fetch needs a literal, runtime value is valid
      const { data, error } = await this.api.GET(path, { params: { path: params.path, query } });
      if (error || !data) return;
      const doc = data as JsonDoc;
      yield doc;
      cursor = doc.links?.meta?.nextCursor;
    } while (cursor);
  }
}
