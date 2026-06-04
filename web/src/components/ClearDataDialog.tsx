interface Props {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation dialog for wiping everything the app stores in this browser. */
export default function ClearDataDialog({ open, busy, onCancel, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">Clear all data?</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This erases everything this app keeps in your browser. Nothing leaves your device, and your
          Spotify and TIDAL accounts are <span className="text-zinc-200">not</span> affected — only
          local data is removed.
        </p>

        <p className="mt-4 text-sm text-zinc-400">You'll lose:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Your saved Spotify and TIDAL Client IDs</li>
          <li>Your login sessions (you'll need to reconnect both services)</li>
          <li>The match cache (re-matching will be slower next time)</li>
          <li>Your local sync history</li>
        </ul>

        <p className="mt-4 text-xs text-zinc-500">
          The page will reload once it's done. Any playlists you already synced to TIDAL stay there.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 cursor-pointer rounded-lg border border-white/10 px-4 py-2.5 font-medium text-zinc-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 cursor-pointer rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Clearing…' : 'Clear all data'}
          </button>
        </div>
      </div>
    </div>
  );
}
