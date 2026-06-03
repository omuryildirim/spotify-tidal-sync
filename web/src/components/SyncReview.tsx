import { useState } from 'react';
import { getTidalTrack, parseTidalTrackId } from '../api';
import type { Destination, SourceMatchResult, SyncPlan, TidalTrack, UnmatchedTrack } from '../api';

/** Per unmatched track, the user's decision: a chosen TIDAL track id, or 'skip'. */
export type Resolutions = Record<string, string>;

const resolveKey = (sourceIdx: number, spotifyId: string) => `${sourceIdx}:${spotifyId}`;

function destinationLabel(d: Destination): string {
  if (d.kind === 'favorites') return 'TIDAL Favorites';
  if (d.kind === 'existing') return `→ ${d.tidalName}`;
  return '＋ new / matched playlist';
}

export default function SyncReview({
  results,
  onBack,
  onConfirm,
}: {
  results: SourceMatchResult[];
  onBack: () => void;
  onConfirm: (plans: SyncPlan[]) => void;
}) {
  const [resolutions, setResolutions] = useState<Resolutions>({});
  // Per-source choice: drop duplicate TIDAL tracks? Default false = sync as-is (mirror Spotify).
  const [dropDupes, setDropDupes] = useState<Record<number, boolean>>({});

  const totals = results.reduce(
    (acc, r) => ({ matched: acc.matched + r.matched.length, total: acc.total + r.total }),
    { matched: 0, total: 0 },
  );
  const unmatchedCount = totals.total - totals.matched;
  const resolvedCount = Object.values(resolutions).filter((v) => v && v !== 'skip').length;

  const pick = (key: string, value: string) => setResolutions((r) => ({ ...r, [key]: value }));

  // Build the write plans: matched tracks plus any user-resolved unmatched picks (skips dropped).
  // When the user opted to remove duplicates for a source, keep only the first occurrence (by source
  // order) of each TIDAL id — dropping later Spotify ids from the map makes the engine skip them.
  const buildPlans = (): SyncPlan[] =>
    results.map((r, i) => {
      const dedupe = dropDupes[i] ?? false;
      const tracks: Record<string, string> = {};
      const seen = new Set<string>();
      const place = (spotifyId: string, tidalId: string) => {
        if (dedupe && seen.has(tidalId)) return;
        seen.add(tidalId);
        tracks[spotifyId] = tidalId;
      };
      for (const m of r.matched) place(m.spotify.id, m.tidal.id);
      for (const u of r.unmatched) {
        const choice = resolutions[resolveKey(i, u.spotify.id)];
        if (choice && choice !== 'skip') place(u.spotify.id, choice);
      }
      return { mapping: r.mapping, tracks };
    });

  const willSync = buildPlans().reduce((n, p) => n + Object.keys(p.tracks).length, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-sm text-zinc-400 hover:text-white">
            ← Back to library
          </button>
          <p className="mt-1 text-sm text-zinc-400">
            Dry run · matched <span className="text-green-400">{totals.matched}</span> of {totals.total} tracks
            {unmatchedCount > 0 && (
              <>
                {' · '}
                <span className="text-amber-400">{unmatchedCount} unmatched</span>
                {resolvedCount > 0 && <span className="text-zinc-500"> ({resolvedCount} resolved)</span>}
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => onConfirm(buildPlans())}
          disabled={willSync === 0}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Sync {willSync} to TIDAL →
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {results.map((r, i) => (
          <SourceCard
            key={`${r.mapping.sourceId}-${i}`}
            result={r}
            sourceIdx={i}
            resolutions={resolutions}
            onPick={pick}
            dropDupes={dropDupes[i] ?? false}
            onDropDupes={(v) => setDropDupes((d) => ({ ...d, [i]: v }))}
          />
        ))}
      </div>
    </div>
  );
}

interface DuplicateGroup {
  tidalId: string;
  title: string;
  artists: string[];
  count: number;
}

/** Group matched tracks by TIDAL id and return those that appear more than once (in source order). */
function findDuplicates(matched: SourceMatchResult['matched']): DuplicateGroup[] {
  const order: string[] = [];
  const byId = new Map<string, DuplicateGroup>();
  for (const m of matched) {
    const existing = byId.get(m.tidal.id);
    if (existing) existing.count += 1;
    else {
      order.push(m.tidal.id);
      byId.set(m.tidal.id, { tidalId: m.tidal.id, title: m.tidal.title, artists: m.spotify.artists, count: 1 });
    }
  }
  return order.map((id) => byId.get(id)!).filter((g) => g.count > 1);
}

function SourceCard({
  result,
  sourceIdx,
  resolutions,
  onPick,
  dropDupes,
  onDropDupes,
}: {
  result: SourceMatchResult;
  sourceIdx: number;
  resolutions: Resolutions;
  onPick: (key: string, value: string) => void;
  dropDupes: boolean;
  onDropDupes: (value: boolean) => void;
}) {
  const [showMatched, setShowMatched] = useState(false);
  const [showDupes, setShowDupes] = useState(false);

  const duplicates = findDuplicates(result.matched);
  const extraCount = duplicates.reduce((n, g) => n + (g.count - 1), 0);
  // For existing playlists / favorites the engine always merges duplicates, so the choice is moot.
  const isNew = result.mapping.destination.kind === 'new';

  return (
    <section className="rounded-xl border border-white/10 bg-white/5">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <span className="font-medium">{result.mapping.sourceName}</span>
          <span className="ml-2 text-sm text-zinc-500">{destinationLabel(result.mapping.destination)}</span>
        </div>
        <span className="text-sm text-zinc-400">
          <span className="text-green-400">{result.matched.length}</span> / {result.total}
        </span>
      </header>

      {extraCount > 0 && (
        <div className="border-b border-white/10 bg-amber-500/[0.04] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button onClick={() => setShowDupes((s) => !s)} className="text-sm text-amber-300 hover:text-amber-200">
              ⧉ {extraCount} duplicate {extraCount === 1 ? 'song' : 'songs'} in this playlist{' '}
              <span className="text-amber-500/70">{showDupes ? '▾' : '▸'}</span>
            </button>
            {isNew ? (
              <div className="flex overflow-hidden rounded-lg border border-white/10 text-xs">
                <DupOption label="Sync as-is" active={!dropDupes} onClick={() => onDropDupes(false)} />
                <DupOption label="Remove duplicates" active={dropDupes} onClick={() => onDropDupes(true)} />
              </div>
            ) : (
              <span className="text-xs text-zinc-500">merged automatically for this destination</span>
            )}
          </div>
          {showDupes && (
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-400">
              {duplicates.map((g) => (
                <li key={g.tidalId} className="truncate">
                  {g.artists.join(', ')} — <span className="text-zinc-300">{g.title}</span>{' '}
                  <span className="text-amber-500/80">×{g.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="px-4 py-3">
        {result.matched.length > 0 && (
          <div className="mb-3">
            <button onClick={() => setShowMatched((s) => !s)} className="text-sm text-zinc-400 hover:text-white">
              {showMatched ? '▾' : '▸'} {result.matched.length} matched
            </button>
            {showMatched && (
              <ol className="mt-2 flex max-h-60 flex-col gap-0.5 overflow-y-auto text-sm">
                {result.matched.map((m, j) => (
                  <li key={j} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="truncate text-zinc-300">
                      {m.spotify.artists.join(', ')} — <span className="text-white">{m.spotify.name}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        m.via === 'isrc' ? 'bg-green-500/15 text-green-400' : 'bg-sky-500/15 text-sky-400'
                      }`}
                    >
                      {m.via}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {result.unmatched.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-amber-400">{result.unmatched.length} need your decision</p>
            {result.unmatched.map((u) => (
              <UnmatchedRow
                key={u.spotify.id}
                track={u}
                value={resolutions[resolveKey(sourceIdx, u.spotify.id)] ?? 'skip'}
                onChange={(v) => onPick(resolveKey(sourceIdx, u.spotify.id), v)}
              />
            ))}
          </div>
        ) : (
          result.matched.length > 0 && <p className="text-sm text-zinc-500">Everything matched. 🎉</p>
        )}
      </div>
    </section>
  );
}

function DupOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 font-medium transition-colors ${
        active ? 'bg-amber-500/20 text-amber-200' : 'text-zinc-400 hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  );
}

function fmtDuration(seconds?: number): string {
  if (seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function UnmatchedRow({
  track,
  value,
  onChange,
}: {
  track: UnmatchedTrack;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Tracks the user pulled in by pasting a TIDAL link; merged into the choices below.
  const [pasted, setPasted] = useState<TidalTrack[]>([]);

  const choices = [...track.alternatives, ...pasted.filter((p) => !track.alternatives.some((a) => a.id === p.id))];
  const chosen = value !== 'skip' ? choices.find((a) => a.id === value) : undefined;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm">
            <span className="text-white">{track.spotify.name}</span>
            <span className="text-zinc-400"> · {track.spotify.artists.join(', ')}</span>
          </div>
          {chosen ? (
            <div className="mt-0.5 truncate text-xs text-sky-400">
              ✓ {chosen.title}
              {chosen.version ? ` (${chosen.version})` : ''} · {chosen.artists.join(', ')}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-zinc-500">
              {choices.length > 0
                ? `${choices.length} potential match${choices.length > 1 ? 'es' : ''}`
                : 'No matches found — paste a TIDAL link or skip'}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
          <span>{fmtDuration(track.spotify.durationMs / 1000)}</span>
          <span className="text-zinc-600">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-amber-500/10 px-3 py-3">
          {choices.length > 0 && (
            <>
              <p className="mb-2 text-xs text-zinc-500">Pick the right TIDAL track, or skip it:</p>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {choices.map((alt) => (
                  <AltCard
                    key={alt.id}
                    title={`${alt.title}${alt.version ? ` (${alt.version})` : ''}`}
                    subtitle={alt.artists.join(', ')}
                    meta={fmtDuration(alt.durationSeconds)}
                    selected={value === alt.id}
                    onClick={() => onChange(value === alt.id ? 'skip' : alt.id)}
                  />
                ))}
                <AltCard title="Skip this track" subtitle="Leave it out of the sync" selected={value === 'skip'} skip onClick={() => onChange('skip')} />
              </div>
            </>
          )}
          <PasteLink
            onResolved={(t) => {
              setPasted((prev) => (prev.some((p) => p.id === t.id) ? prev : [...prev, t]));
              onChange(t.id);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PasteLink({ onResolved }: { onResolved: (track: TidalTrack) => void }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    const id = parseTidalTrackId(url);
    if (!id) {
      setState('error');
      setError('That doesn’t look like a TIDAL track link.');
      return;
    }
    setState('loading');
    try {
      const { track } = await getTidalTrack(id);
      setState('idle');
      setUrl('');
      onResolved(track);
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Could not load that track.');
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-xs text-zinc-500">Know the exact track? Paste its TIDAL link:</p>
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (state === 'error') setState('idle');
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="https://tidal.com/browse/track/12345678"
          className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <button
          onClick={() => void submit()}
          disabled={state === 'loading' || !url.trim()}
          className="shrink-0 rounded bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40"
        >
          {state === 'loading' ? 'Loading…' : 'Add'}
        </button>
      </div>
      {state === 'error' && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function AltCard({
  title,
  subtitle,
  meta,
  selected,
  skip = false,
  onClick,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  selected: boolean;
  skip?: boolean;
  onClick: () => void;
}) {
  const base = 'flex flex-col rounded-lg border px-3 py-2 text-left transition-colors';
  const tone = selected
    ? skip
      ? 'border-zinc-400/50 bg-zinc-400/10'
      : 'border-sky-500 bg-sky-500/15'
    : 'border-white/10 bg-black/30 hover:border-white/25';
  return (
    <button onClick={onClick} className={`${base} ${tone}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate text-sm ${skip ? 'text-zinc-300' : 'text-white'}`}>
          {selected && !skip ? '✓ ' : ''}
          {title}
        </span>
        {meta && <span className="shrink-0 text-xs text-zinc-500">{meta}</span>}
      </div>
      <span className="truncate text-xs text-zinc-400">{subtitle}</span>
    </button>
  );
}
