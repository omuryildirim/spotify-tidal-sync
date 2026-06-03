import type { SpotifyClient } from '../spotify/client.js';
import type { TidalClient, TidalTrack } from '../tidal/types.js';
import type { SpotifyTrack } from '../spotify/types.js';
import { bestMatch, isrcMatch, simple } from './matcher.js';
import type {
  MatchedTrack,
  SourceMatchResult,
  SyncMapping,
  SyncPlan,
  SyncRunResult,
  UnmatchedTrack,
} from './types.js';

/** How many TIDAL candidates to keep for the user to pick from when nothing matched. */
const MAX_ALTERNATIVES = 6;
/**
 * How many residual (non-ISRC) tracks to text-search against TIDAL at once. Kept low on purpose:
 * we care far more about finding everything than about speed, and a gentle request rate (plus the
 * client's retry/backoff) is what keeps us under TIDAL's rate limits.
 */
const MATCH_CONCURRENCY = 2;

export interface TrackMatch {
  spotify: SpotifyTrack;
  tidal?: TidalTrack;
  via?: 'isrc' | 'name';
  alternatives: TidalTrack[];
}

/** Per-track match cache (keyed by Spotify track id) so re-runs reuse work already done. */
export type MatchCache = Map<string, TrackMatch>;

/** Streaming callbacks so callers (e.g. the HTTP layer) can report live progress. */
export interface DryRunEvents {
  onMeta?(meta: { sources: Array<{ name: string; total: number }>; total: number }): void;
  onProgress?(done: number, total: number): void;
  onSourceDone?(result: SourceMatchResult): void;
}

/**
 * Build the text-search queries to try, in order. The cleaned title (version/parenthetical
 * suffixes stripped) plus the primary artist is the most reliable; the raw "title + all artists"
 * is kept as a fallback for the rare case where the suffix was actually load-bearing.
 */
function buildQueries(spotify: SpotifyTrack): string[] {
  const primaryArtist = spotify.artists[0] ?? '';
  const cleanName = simple(spotify.name);
  const queries = [`${cleanName} ${primaryArtist}`.trim(), `${spotify.name} ${spotify.artists.join(' ')}`.trim()];
  return [...new Set(queries.filter(Boolean))];
}

/**
 * Find the best TIDAL track for one Spotify track. The caller supplies any tracks already found
 * by the batched ISRC lookup; if none match, we try a couple of text-search variants. When nothing
 * matches confidently, the candidates we saw are returned as alternatives to choose from.
 */
export async function matchTrack(
  tidal: TidalClient,
  spotify: SpotifyTrack,
  isrcHits: TidalTrack[] = [],
): Promise<TrackMatch> {
  const byIsrc = isrcHits.find((t) => isrcMatch(t, spotify));
  if (byIsrc) return { spotify, tidal: byIsrc, via: 'isrc', alternatives: [] };

  const seen = new Map<string, TidalTrack>();
  for (const query of buildQueries(spotify)) {
    const candidates = await tidal.searchByText(query);
    for (const c of candidates) if (!seen.has(c.id)) seen.set(c.id, c);
    const hit = bestMatch(candidates, spotify);
    if (hit) return { spotify, tidal: hit, via: 'name', alternatives: [] };
  }

  return { spotify, alternatives: [...seen.values()].slice(0, MAX_ALTERNATIVES) };
}

/** Run `fn` over `items` with bounded concurrency, preserving input order in the result. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Fetch the Spotify tracks for a mapping's source (a playlist or the Liked Songs). */
async function loadSourceTracks(spotify: SpotifyClient, mapping: SyncMapping): Promise<SpotifyTrack[]> {
  return mapping.sourceKind === 'liked'
    ? spotify.getLikedTracks()
    : spotify.getPlaylistTracks(mapping.sourceId);
}

/**
 * Dry run: for each mapping, match its Spotify tracks to TIDAL without writing anything.
 *
 * We first load every source's tracks (so we can report an accurate overall total), then match.
 * A `cache` keyed by Spotify track id is consulted before any network call and updated as we go,
 * so navigating back and forth (or re-running an overlapping source) reuses prior matches.
 * `events` (if given) stream per-track progress and per-source completion.
 */
export async function dryRun(
  spotify: SpotifyClient,
  tidal: TidalClient,
  mappings: SyncMapping[],
  cache: MatchCache = new Map(),
  events?: DryRunEvents,
): Promise<SourceMatchResult[]> {
  // Phase 1 — load all source track lists so the progress bar has a real denominator.
  const sources: Array<{ mapping: SyncMapping; tracks: SpotifyTrack[] }> = [];
  for (const mapping of mappings) {
    sources.push({ mapping, tracks: await loadSourceTracks(spotify, mapping) });
  }
  const total = sources.reduce((n, s) => n + s.tracks.length, 0);
  events?.onMeta?.({ sources: sources.map((s) => ({ name: s.mapping.sourceName, total: s.tracks.length })), total });

  // Phase 2 — match each source's tracks, reusing the cache and streaming progress.
  let done = 0;
  const out: SourceMatchResult[] = [];
  for (const { mapping, tracks } of sources) {
    // Batch-resolve ISRCs only for tracks we haven't matched before.
    const uncached = tracks.filter((t) => !cache.has(t.id));
    const isrcMap = await tidal.lookupIsrcs(uncached.map((t) => t.isrc).filter((x): x is string => Boolean(x)));

    const matches = await mapPool(tracks, MATCH_CONCURRENCY, async (t) => {
      const match =
        cache.get(t.id) ?? (await matchTrack(tidal, t, t.isrc ? (isrcMap.get(t.isrc) ?? []) : []));
      // Only cache confident matches. A miss may be transient (a throttled/empty search), so we
      // re-attempt unmatched tracks on every run rather than freezing a false "not found".
      if (match.tidal) cache.set(t.id, match);
      events?.onProgress?.((done += 1), total);
      return match;
    });

    const matched: MatchedTrack[] = [];
    const unmatched: UnmatchedTrack[] = [];
    for (const m of matches) {
      if (m.tidal && m.via) matched.push({ spotify: m.spotify, tidal: m.tidal, via: m.via });
      else unmatched.push({ spotify: m.spotify, alternatives: m.alternatives });
    }

    const result: SourceMatchResult = { mapping, total: tracks.length, matched, unmatched };
    out.push(result);
    events?.onSourceDone?.(result);
  }
  return out;
}

/** Streaming callbacks for the write phase. */
export interface SyncRunEvents {
  onMeta?(meta: { plans: Array<{ name: string; total: number }>; total: number }): void;
  onProgress?(done: number, total: number): void;
  onPlanDone?(result: SyncRunResult): void;
}

/**
 * Write confirmed plans to TIDAL, preserving Spotify order exactly.
 *
 * For each plan we re-fetch the Spotify source so the order is authoritative (not derived from the
 * dry run), then map each track — in order — to its chosen TIDAL id and append in chunks. New
 * playlists are created and filled in order; existing playlists and favorites get only the tracks
 * not already present, appended in order (non-destructive). A failing plan is reported and skipped
 * rather than aborting the whole run.
 */
export async function runSync(
  spotify: SpotifyClient,
  tidal: TidalClient,
  plans: SyncPlan[],
  events?: SyncRunEvents,
): Promise<SyncRunResult[]> {
  // Phase 1 — recover authoritative order and the ordered TIDAL id list for each plan.
  // We keep duplicates here so a "new" playlist mirrors the Spotify source exactly (a song listed
  // twice in Spotify stays twice). De-duping only happens for append/favorites destinations below.
  const prepared: Array<{ plan: SyncPlan; ordered: string[] }> = [];
  for (const plan of plans) {
    const sourceTracks = await loadSourceTracks(spotify, plan.mapping);
    const ordered = sourceTracks
      .map((t) => plan.tracks[t.id])
      .filter((id): id is string => Boolean(id));
    prepared.push({ plan, ordered });
  }
  const total = prepared.reduce((n, p) => n + p.ordered.length, 0);
  events?.onMeta?.({ plans: prepared.map((p) => ({ name: p.plan.mapping.sourceName, total: p.ordered.length })), total });

  // Phase 2 — write each plan.
  let done = 0;
  const out: SyncRunResult[] = [];
  for (const { plan, ordered } of prepared) {
    const dest = plan.mapping.destination;
    const base = done;
    const tick = (added: number, alreadyPresent: number) => events?.onProgress?.(base + alreadyPresent + added, total);
    try {
      let result: SyncRunResult;
      if (dest.kind === 'new') {
        const playlist = await tidal.createPlaylist(plan.mapping.sourceName);
        await tidal.addTracks(playlist.id, ordered, (added) => tick(added, 0));
        result = {
          sourceId: plan.mapping.sourceId,
          sourceName: plan.mapping.sourceName,
          destination: dest,
          playlistId: playlist.id,
          playlistName: playlist.name,
          requested: ordered.length,
          added: ordered.length,
          alreadyPresent: 0,
        };
      } else if (dest.kind === 'existing') {
        // Append-missing: collapse duplicates and skip tracks already in the playlist.
        const existing = new Set((await tidal.getPlaylistTracks(dest.tidalId)).map((t) => t.id));
        const unique = [...new Set(ordered)];
        const toAdd = unique.filter((id) => !existing.has(id));
        const alreadyPresent = unique.length - toAdd.length;
        tick(0, alreadyPresent);
        await tidal.addTracks(dest.tidalId, toAdd, (added) => tick(added, alreadyPresent));
        result = {
          sourceId: plan.mapping.sourceId,
          sourceName: plan.mapping.sourceName,
          destination: dest,
          playlistId: dest.tidalId,
          playlistName: dest.tidalName,
          requested: ordered.length,
          added: toAdd.length,
          alreadyPresent,
        };
      } else {
        // Favorites is a set: collapse duplicates and skip ones already favorited.
        const existing = new Set((await tidal.getFavoriteTracks()).map((t) => t.id));
        const unique = [...new Set(ordered)];
        const toAdd = unique.filter((id) => !existing.has(id));
        const alreadyPresent = unique.length - toAdd.length;
        tick(0, alreadyPresent);
        await tidal.addFavoriteTracks(toAdd, (added) => tick(added, alreadyPresent));
        result = {
          sourceId: plan.mapping.sourceId,
          sourceName: plan.mapping.sourceName,
          destination: dest,
          playlistName: 'TIDAL Favorites',
          requested: ordered.length,
          added: toAdd.length,
          alreadyPresent,
        };
      }
      done = base + ordered.length;
      events?.onProgress?.(done, total);
      out.push(result);
      events?.onPlanDone?.(result);
    } catch (err) {
      done = base + ordered.length;
      const result: SyncRunResult = {
        sourceId: plan.mapping.sourceId,
        sourceName: plan.mapping.sourceName,
        destination: dest,
        requested: ordered.length,
        added: 0,
        alreadyPresent: 0,
        error: err instanceof Error ? err.message : 'Sync failed',
      };
      out.push(result);
      events?.onPlanDone?.(result);
    }
  }
  return out;
}
