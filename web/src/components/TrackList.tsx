export interface TrackRow {
  primary: string; // artists
  secondary: string; // title
  seconds?: number;
}

function fmt(seconds?: number): string {
  if (seconds === undefined) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TrackList({ rows, state }: { rows?: TrackRow[]; state: 'loading' | 'ready' | 'error' }) {
  if (state === 'loading') return <p className="py-2 text-sm text-zinc-500">Loading tracks…</p>;
  if (state === 'error') return <p className="py-2 text-sm text-red-400">Failed to load tracks.</p>;
  if (!rows || rows.length === 0) return <p className="py-2 text-sm text-zinc-500">No tracks.</p>;
  return (
    <ol className="flex max-h-72 flex-col gap-0.5 overflow-y-auto py-1 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="flex justify-between gap-3 py-0.5">
          <span className="truncate text-zinc-300">
            <span className="text-zinc-600">{i + 1}.</span> {r.primary} — <span className="text-white">{r.secondary}</span>
          </span>
          <span className="shrink-0 text-zinc-500">{fmt(r.seconds)}</span>
        </li>
      ))}
    </ol>
  );
}
