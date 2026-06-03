interface Props {
  title: string;
  accent: string; // tailwind text color, e.g. "text-green-400"
  button: string; // tailwind bg classes for the connect button
  connected: boolean;
  name?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  busy: boolean;
  onClientId: (v: string) => void;
  onClientSecret: (v: string) => void;
  onConnect: () => void;
}

export default function ServicePanel(props: Props) {
  const { title, accent, button, connected, name, busy } = props;
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`text-xl font-semibold ${accent}`}>{title}</h2>
        {connected ? (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-400" /> connected
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-zinc-600" /> not connected
          </span>
        )}
      </div>

      {connected ? (
        <div className="flex flex-1 flex-col justify-center py-6 text-center">
          <div className="text-3xl">✓</div>
          <p className="mt-2 text-zinc-300">
            Connected as <span className="font-medium text-white">{name ?? 'user'}</span>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Client ID</span>
            <input
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/30"
              value={props.clientId}
              onChange={(e) => props.onClientId(e.target.value)}
              placeholder="from the developer dashboard"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Client Secret</span>
            <input
              type="password"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/30"
              value={props.clientSecret}
              onChange={(e) => props.onClientSecret(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Redirect URI to register:
            <br />
            <code className="text-zinc-400">{props.redirectUri}</code>
          </p>
          <button
            onClick={props.onConnect}
            disabled={busy || !props.clientId}
            className={`mt-1 rounded-lg px-4 py-2 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${button}`}
          >
            {busy ? 'Connecting…' : `Connect ${title}`}
          </button>
        </div>
      )}
    </div>
  );
}
