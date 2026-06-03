import { useEffect, useState } from 'react';
import ServicePanel from './components/ServicePanel';
import LibraryBrowser from './components/LibraryBrowser';
import SyncReview from './components/SyncReview';
import SyncSummary from './components/SyncSummary';
import {
  getStatus,
  getCredentials,
  saveCredentials,
  getLoginUrl,
  dryRunSync,
  runSync,
  type Status,
  type AppCredentials,
  type Service,
  type SyncMapping,
  type SourceMatchResult,
  type SyncPlan,
  type SyncRunResult,
} from './api';

const EMPTY_CREDS: AppCredentials = {
  spotify: { clientId: '', clientSecret: '' },
  tidal: { clientId: '', clientSecret: '' },
};

const REDIRECTS: Record<Service, string> = {
  spotify: 'http://127.0.0.1:8888/api/auth/spotify/callback',
  tidal: 'http://127.0.0.1:8888/api/auth/tidal/callback',
};

export default function App() {
  const [creds, setCreds] = useState<AppCredentials>(EMPTY_CREDS);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [review, setReview] = useState<SourceMatchResult[] | null>(null);
  const [writing, setWriting] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SyncRunResult[] | null>(null);

  useEffect(() => {
    // Surface any ?connected / ?error from an OAuth round-trip, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError(`Authorization failed for ${params.get('error')}.`);
    if (params.has('connected') || params.has('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    void getCredentials().then(setCreds).catch(() => {});
    void getStatus().then(setStatus).catch(() => {});
  }, []);

  const connect = async (service: Service) => {
    setBusy(service);
    setError(null);
    try {
      await saveCredentials(creds);
      const { url } = await getLoginUrl(service);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const runDryRun = async (mappings: SyncMapping[]) => {
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const results = await dryRunSync(mappings, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setReview(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const runWrite = async (plans: SyncPlan[]) => {
    setError(null);
    setWriting({ done: 0, total: 0 });
    try {
      const results = await runSync(plans, {
        onProgress: (done, total) => setWriting({ done, total }),
      });
      setReview(null);
      setSummary(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(null);
    }
  };

  const resetToLibrary = () => {
    setSummary(null);
    setReview(null);
  };

  const bothConnected = status?.spotify.connected && status?.tidal.connected;

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 to-black text-white">
      <div className={`mx-auto px-6 py-16 ${bothConnected ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            spotify <span className="text-zinc-500">→</span> tidal
          </h1>
          <p className="mt-2 text-zinc-400">
            {!bothConnected
              ? 'Connect both accounts to import your playlists.'
              : summary
                ? 'All done.'
                : writing
                  ? 'Writing to TIDAL — keeping your Spotify order.'
                  : review
                    ? 'Review the matches, resolve anything unmatched, then confirm.'
                    : 'Pick what to sync, choose a destination, and go.'}
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {bothConnected ? (
          summary ? (
            <SyncSummary results={summary} onDone={resetToLibrary} />
          ) : writing ? (
            <MatchProgress done={writing.done} total={writing.total} label="Adding tracks to TIDAL…" note="Tracks are written in your exact Spotify order." />
          ) : review ? (
            <SyncReview results={review} onBack={() => setReview(null)} onConfirm={(plans) => void runWrite(plans)} />
          ) : progress ? (
            <MatchProgress done={progress.done} total={progress.total} />
          ) : (
            <LibraryBrowser onSync={(mappings) => void runDryRun(mappings)} />
          )
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ServicePanel
              title="Spotify"
              accent="text-green-400"
              button="bg-green-600 hover:bg-green-500"
              connected={status?.spotify.connected ?? false}
              name={status?.spotify.name}
              clientId={creds.spotify.clientId}
              clientSecret={creds.spotify.clientSecret}
              redirectUri={REDIRECTS.spotify}
              busy={busy === 'spotify'}
              onClientId={(v) => setCreds((c) => ({ ...c, spotify: { ...c.spotify, clientId: v } }))}
              onClientSecret={(v) => setCreds((c) => ({ ...c, spotify: { ...c.spotify, clientSecret: v } }))}
              onConnect={() => void connect('spotify')}
            />
            <ServicePanel
              title="TIDAL"
              accent="text-sky-400"
              button="bg-sky-600 hover:bg-sky-500"
              connected={status?.tidal.connected ?? false}
              name={status?.tidal.name}
              clientId={creds.tidal.clientId}
              clientSecret={creds.tidal.clientSecret}
              redirectUri={REDIRECTS.tidal}
              busy={busy === 'tidal'}
              onClientId={(v) => setCreds((c) => ({ ...c, tidal: { ...c.tidal, clientId: v } }))}
              onClientSecret={(v) => setCreds((c) => ({ ...c, tidal: { ...c.tidal, clientSecret: v } }))}
              onConnect={() => void connect('tidal')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MatchProgress({
  done,
  total,
  label = 'Matching your tracks against TIDAL…',
  note = "Going easy on TIDAL's rate limits, so this can take a bit on large playlists.",
}: {
  done: number;
  total: number;
  label?: string;
  note?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <p className="text-lg font-medium">{label}</p>
      <p className="mt-1 text-sm text-zinc-400">{total > 0 ? `${done} / ${total} tracks` : 'Loading tracks…'}</p>
      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
          style={{ width: `${total > 0 ? pct : 8}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-zinc-500">{note}</p>
    </div>
  );
}
