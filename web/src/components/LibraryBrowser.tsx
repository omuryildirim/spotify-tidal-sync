import { useEffect, useState } from 'react';
import TrackList, { type TrackRow } from './TrackList';
import {
  getPlaylists,
  getPlaylistTracks,
  getLikedCount,
  getLikedTracks,
  getTidalPlaylists,
  getTidalPlaylistTracks,
  getTidalFavorites,
  clearMatchCache,
  getSyncHistory,
  type SpotifyPlaylist,
  type TidalPlaylist,
  type SyncMapping,
  type Destination,
  type SyncHistory,
} from '../api';

/** Compact "time ago" label for the last-synced badge. */
function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const CLEAR_CACHE_PROMPT =
  'Clear the match cache?\n\n' +
  'The cache remembers which TIDAL track each Spotify song matched to, so running again is much ' +
  'faster and makes far fewer requests to TIDAL — which is the main thing keeping you under its ' +
  'rate limits. Normally it is best to leave it alone.\n\n' +
  'But if matching has been acting up — e.g. a song you know exists keeps coming back as “not ' +
  'found” — clearing the cache forces a fresh look-up and often fixes it.\n\n' +
  'Clear it now?';

const LIKED = 'liked';
const FAVORITES = 'favorites';

type TrackState = { state: 'loading' | 'ready' | 'error'; rows?: TrackRow[] };

export default function LibraryBrowser({ onSync }: { onSync: (mappings: SyncMapping[]) => void }) {
  const [spotify, setSpotify] = useState<SpotifyPlaylist[]>([]);
  const [likedCount, setLikedCount] = useState<number | null>(null);
  const [tidal, setTidal] = useState<TidalPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dest, setDest] = useState<Record<string, string>>({}); // sourceId -> 'new' | tidalPlaylistId
  const [open, setOpen] = useState<string | null>(null); // namespaced key e.g. "sp:<id>"
  const [tracks, setTracks] = useState<Record<string, TrackState>>({});
  const [cacheNote, setCacheNote] = useState<string | null>(null);
  const [history, setHistory] = useState<SyncHistory>({});

  const clearCache = async () => {
    if (!window.confirm(CLEAR_CACHE_PROMPT)) return;
    try {
      const { cleared } = await clearMatchCache();
      setCacheNote(cleared > 0 ? `Cleared ${cleared} cached match${cleared === 1 ? '' : 'es'}.` : 'Cache was already empty.');
    } catch {
      setCacheNote('Could not clear the cache.');
    }
    setTimeout(() => setCacheNote(null), 4000);
  };

  useEffect(() => {
    Promise.all([getPlaylists(), getLikedCount(), getTidalPlaylists()])
      .then(([p, l, t]) => {
        setSpotify(p.playlists);
        setLikedCount(l.total);
        setTidal(t.playlists);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    void getSyncHistory().then(setHistory).catch(() => {});
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const drill = (key: string, fetcher: () => Promise<TrackRow[]>) => {
    setOpen((cur) => (cur === key ? null : key));
    if (!tracks[key]) {
      setTracks((t) => ({ ...t, [key]: { state: 'loading' } }));
      fetcher()
        .then((rows) => setTracks((t) => ({ ...t, [key]: { state: 'ready', rows } })))
        .catch(() => setTracks((t) => ({ ...t, [key]: { state: 'error' } })));
    }
  };

  const buildMappings = (): SyncMapping[] => {
    const out: SyncMapping[] = [];
    if (selected.has(LIKED)) {
      out.push({ sourceId: LIKED, sourceName: 'Liked Songs', sourceKind: 'liked', destination: { kind: 'favorites' } });
    }
    for (const p of spotify) {
      if (!selected.has(p.id)) continue;
      const choice = dest[p.id] ?? 'new';
      let destination: Destination;
      if (choice === 'new') destination = { kind: 'new' };
      else {
        const tp = tidal.find((t) => t.id === choice);
        destination = { kind: 'existing', tidalId: choice, tidalName: tp?.name ?? '' };
      }
      out.push({ sourceId: p.id, sourceName: p.name, sourceKind: 'playlist', destination });
    }
    return out;
  };

  if (loading) return <Centered>Loading your libraries…</Centered>;
  if (error) return <Centered className="text-red-300">{error}</Centered>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-400">{selected.size} selected to sync</p>
          <button onClick={() => void clearCache()} className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline">
            Clear match cache
          </button>
          {cacheNote && <span className="text-xs text-zinc-500">{cacheNote}</span>}
        </div>
        <button
          onClick={() => onSync(buildMappings())}
          disabled={selected.size === 0}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sync {selected.size > 0 ? selected.size : ''} →
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Spotify source column */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-green-400">Spotify · source</h2>
          <ul className="flex flex-col gap-1.5">
            <SourceRow
              id={LIKED}
              title="★ Liked Songs"
              count={likedCount ?? undefined}
              selected={selected.has(LIKED)}
              onToggle={() => toggle(LIKED)}
              open={open === `sp:${LIKED}`}
              onDrill={() => drill(`sp:${LIKED}`, () => getLikedTracks().then(toSpotifyRows))}
              tracks={tracks[`sp:${LIKED}`]}
              lastSynced={history[LIKED]?.syncedAt}
              destControl={<span className="text-xs text-zinc-400">→ TIDAL Favorites</span>}
            />
            {spotify.map((p) => (
              <SourceRow
                key={p.id}
                id={p.id}
                title={p.name || '(untitled)'}
                count={p.trackCount}
                selected={selected.has(p.id)}
                onToggle={() => toggle(p.id)}
                open={open === `sp:${p.id}`}
                onDrill={() => drill(`sp:${p.id}`, () => getPlaylistTracks(p.id).then(toSpotifyRows))}
                tracks={tracks[`sp:${p.id}`]}
                lastSynced={history[p.id]?.syncedAt}
                destControl={
                  <select
                    value={dest[p.id] ?? 'new'}
                    onChange={(e) => setDest((d) => ({ ...d, [p.id]: e.target.value }))}
                    className="max-w-[14rem] rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="new">＋ Create</option>
                    {tidal.map((t) => (
                      <option key={t.id} value={t.id}>
                        → {t.name}
                      </option>
                    ))}
                  </select>
                }
              />
            ))}
          </ul>
        </section>

        {/* TIDAL library column (read-only) */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-400">TIDAL · your library</h2>
          <ul className="flex flex-col gap-1.5">
            <LibraryRow
              title="★ Favorites"
              open={open === `td:${FAVORITES}`}
              onDrill={() => drill(`td:${FAVORITES}`, () => getTidalFavorites().then(toTidalRows))}
              tracks={tracks[`td:${FAVORITES}`]}
            />
            {tidal.length === 0 && <li className="px-1 py-2 text-sm text-zinc-500">No TIDAL playlists yet.</li>}
            {tidal.map((t) => (
              <LibraryRow
                key={t.id}
                title={t.name || '(untitled)'}
                count={t.numberOfItems}
                open={open === `td:${t.id}`}
                onDrill={() => drill(`td:${t.id}`, () => getTidalPlaylistTracks(t.id).then(toTidalRows))}
                tracks={tracks[`td:${t.id}`]}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SourceRow(props: {
  id: string;
  title: string;
  count?: number;
  selected: boolean;
  onToggle: () => void;
  open: boolean;
  onDrill: () => void;
  tracks?: TrackState;
  destControl: React.ReactNode;
  lastSynced?: string;
}) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input type="checkbox" checked={props.selected} onChange={props.onToggle} className="h-4 w-4 accent-sky-500" />
        <button onClick={props.onDrill} className="flex flex-1 items-center justify-between text-left">
          <span className="flex items-baseline gap-2">
            <span className="font-medium">{props.title}</span>
            {props.lastSynced && (
              <span className="text-xs text-green-500/70" title={new Date(props.lastSynced).toLocaleString()}>
                ✓ synced {timeAgo(props.lastSynced)}
              </span>
            )}
          </span>
          <span className="text-sm text-zinc-400">
            {props.count ?? '—'} <span className="ml-1 text-zinc-600">{props.open ? '▾' : '▸'}</span>
          </span>
        </button>
      </div>
      {props.selected && <div className="border-t border-white/10 px-3 py-2">{props.destControl}</div>}
      {props.open && (
        <div className="border-t border-white/10 px-3 py-1">
          <TrackList rows={props.tracks?.rows} state={props.tracks?.state ?? 'loading'} />
        </div>
      )}
    </li>
  );
}

function LibraryRow(props: { title: string; count?: number; open: boolean; onDrill: () => void; tracks?: TrackState }) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5">
      <button onClick={props.onDrill} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="font-medium">{props.title}</span>
        <span className="text-sm text-zinc-400">
          {props.count ?? ''} <span className="ml-1 text-zinc-600">{props.open ? '▾' : '▸'}</span>
        </span>
      </button>
      {props.open && (
        <div className="border-t border-white/10 px-3 py-1">
          <TrackList rows={props.tracks?.rows} state={props.tracks?.state ?? 'loading'} />
        </div>
      )}
    </li>
  );
}

const toSpotifyRows = (r: { tracks: { artists: string[]; name: string; durationMs: number }[] }): TrackRow[] =>
  r.tracks.map((t) => ({ primary: t.artists.join(', '), secondary: t.name, seconds: t.durationMs / 1000 }));

const toTidalRows = (r: { tracks: { artists: string[]; title: string; durationSeconds?: number }[] }): TrackRow[] =>
  r.tracks.map((t) => ({ primary: t.artists.join(', '), secondary: t.title, seconds: t.durationSeconds }));

function Centered({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`py-20 text-center text-zinc-400 ${className}`}>{children}</div>;
}
