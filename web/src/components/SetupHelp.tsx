interface Props {
  open: boolean;
  redirectUri: string;
  onClose: () => void;
}

/** First-run explainer for getting Spotify + TIDAL developer credentials. */
export default function SetupHelp({ open, redirectUri, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold">Before you start</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This app runs entirely in your browser — it talks straight to Spotify and TIDAL and stores
          everything locally. To do that you bring your own (free) developer apps from each service
          and paste their <span className="text-zinc-200">Client ID</span> here. It takes a couple of
          minutes, once.
        </p>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm">
          <span className="text-zinc-400">Redirect URI to register on both apps:</span>
          <br />
          <code className="break-all text-zinc-200">{redirectUri}</code>
        </div>

        <section className="mt-6">
          <h3 className="text-lg font-semibold text-green-400">Spotify</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
            <li>
              Go to the{' '}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer text-green-400 underline underline-offset-2"
              >
                Spotify developer dashboard
              </a>{' '}
              and create an app.
            </li>
            <li>
              Enable <span className="text-white">Web API</span> access and set the{' '}
              <span className="text-white">Redirect URI</span> to the URL above.
            </li>
            <li>Copy the app's Client ID into the Spotify panel here.</li>
          </ol>
          <p className="mt-1.5 text-xs text-zinc-500">
            When you connect, Spotify will ask you to grant access to your account.
          </p>
        </section>

        <section className="mt-5">
          <h3 className="text-lg font-semibold text-sky-400">TIDAL</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-300">
            <li>
              Go to the{' '}
              <a
                href="https://developer.tidal.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer text-sky-400 underline underline-offset-2"
              >
                TIDAL developer dashboard
              </a>{' '}
              and create an app (it only asks for a name).
            </li>
            <li>
              Open the app, go to the <span className="text-white">Settings</span> tab, scroll down
              and click <span className="text-white">Edit</span>.
            </li>
            <li>Add the Redirect URI above.</li>
            <li>
              Enable at least these scopes:{' '}
              <code className="text-zinc-200">collection.read</code>,{' '}
              <code className="text-zinc-200">collection.write</code>,{' '}
              <code className="text-zinc-200">playlist.read</code>,{' '}
              <code className="text-zinc-200">playlist.write</code>, then save.
            </li>
            <li>Copy the app's Client ID into the TIDAL panel here.</li>
          </ol>
        </section>

        <button
          onClick={onClose}
          className="mt-7 w-full cursor-pointer rounded-lg bg-white px-4 py-2.5 font-medium text-black transition hover:bg-zinc-200"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
