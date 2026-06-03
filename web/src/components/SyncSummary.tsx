import type { SyncRunResult } from '../api';

function destLabel(r: SyncRunResult): string {
  if (r.destination.kind === 'favorites') return 'TIDAL Favorites';
  if (r.destination.kind === 'existing') return r.playlistName ?? 'existing playlist';
  return r.playlistName ?? 'new playlist';
}

/** Link to a TIDAL playlist if we created/know its id. */
function playlistUrl(r: SyncRunResult): string | null {
  return r.playlistId ? `https://tidal.com/browse/playlist/${r.playlistId}` : null;
}

export default function SyncSummary({ results, onDone }: { results: SyncRunResult[]; onDone: () => void }) {
  const totalAdded = results.reduce((n, r) => n + r.added, 0);
  const anyError = results.some((r) => r.error);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="text-center">
        <div className="text-4xl">{anyError ? '⚠️' : '✅'}</div>
        <h2 className="mt-2 text-xl font-semibold">
          {anyError ? 'Synced with some issues' : 'Sync complete'}
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Added {totalAdded} track{totalAdded === 1 ? '' : 's'} to TIDAL, in your Spotify order.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {results.map((r, i) => {
          const url = playlistUrl(r);
          return (
            <li key={i} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {r.sourceName} <span className="text-zinc-500">→</span> {destLabel(r)}
                  </div>
                  {r.error ? (
                    <div className="mt-0.5 text-xs text-red-400">{r.error}</div>
                  ) : (
                    <div className="mt-0.5 text-xs text-zinc-400">
                      {r.added} added
                      {r.alreadyPresent > 0 && <span className="text-zinc-500"> · {r.alreadyPresent} already there</span>}
                      {r.requested > r.added + r.alreadyPresent && (
                        <span className="text-zinc-500"> · {r.requested - r.added - r.alreadyPresent} skipped</span>
                      )}
                    </div>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                  >
                    Open in TIDAL ↗
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="text-center">
        <button
          onClick={onDone}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
        >
          Back to library
        </button>
      </div>
    </div>
  );
}
