import { useEffect, useState } from 'react';
import ServicePanel from './components/ServicePanel';
import SetupHelp from './components/SetupHelp';
import ClearDataDialog from './components/ClearDataDialog';
import LibraryBrowser from './components/LibraryBrowser';
import SyncReview from './components/SyncReview';
import SyncSummary from './components/SyncSummary';
import { getString, setString } from './lib/storage';
import { redirectUri } from './lib/config';
import {
  getStatus,
  getCredentials,
  saveCredentials,
  getLoginUrl,
  finishLoginRedirect,
  clearAllData,
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
  spotify: { clientId: '' },
  tidal: { clientId: '' },
};

// Both OAuth flows redirect here (must be registered on each app). Overridable via VITE_REDIRECT_URI.
const REDIRECT_URI = redirectUri();

export default function App() {
  const [creds, setCreds] = useState<AppCredentials>(EMPTY_CREDS);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [review, setReview] = useState<SourceMatchResult[] | null>(null);
  const [writing, setWriting] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SyncRunResult[] | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    // Pop the setup explainer the first time someone lands here.
    if (!getString('seenSetupHelp')) setShowHelp(true);
    void getCredentials().then(setCreds).catch(() => {});
    // Finish any OAuth redirect (exchange the code for a token), then load status. Clean the URL.
    finishLoginRedirect()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
        void getStatus().then(setStatus).catch(() => {});
      });
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

  const closeHelp = () => {
    setShowHelp(false);
    setString('seenSetupHelp', '1');
  };

  const confirmClear = async () => {
    setClearing(true);
    try {
      await clearAllData();
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClearing(false);
      setShowClear(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 to-black text-white">
      <SetupHelp open={showHelp} redirectUri={REDIRECT_URI} onClose={closeHelp} />
      <ClearDataDialog
        open={showClear}
        busy={clearing}
        onCancel={() => setShowClear(false)}
        onConfirm={() => void confirmClear()}
      />
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
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ServicePanel
              title="Spotify"
              accent="text-green-400"
              button="bg-green-600 hover:bg-green-500"
              connected={status?.spotify.connected ?? false}
              name={status?.spotify.name}
              clientId={creds.spotify.clientId}
              redirectUri={REDIRECT_URI}
              busy={busy === 'spotify'}
              onClientId={(v) => setCreds((c) => ({ ...c, spotify: { clientId: v } }))}
              onConnect={() => void connect('spotify')}
            />
            <ServicePanel
              title="TIDAL"
              accent="text-sky-400"
              button="bg-sky-600 hover:bg-sky-500"
              connected={status?.tidal.connected ?? false}
              name={status?.tidal.name}
              clientId={creds.tidal.clientId}
              redirectUri={REDIRECT_URI}
              busy={busy === 'tidal'}
              onClientId={(v) => setCreds((c) => ({ ...c, tidal: { clientId: v } }))}
              onConnect={() => void connect('tidal')}
            />
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowHelp(true)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  ?
                </span>
                How do I get these credentials?
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="mx-auto max-w-2xl px-6 pb-10 text-center text-xs leading-relaxed text-zinc-600">
        <span className="font-medium text-zinc-500">Your data stays with you.</span> Everything runs
        in your browser — your Spotify and TIDAL data is read, matched, and written directly between
        your browser and those services. Nothing is sent to, stored on, or published by any server of
        ours; there is no backend. Your credentials, tokens, and sync history live only in this
        browser's local storage.
        {(status?.spotify.connected || status?.tidal.connected) && (
          <>
            <br />
            <button
              onClick={() => setShowClear(true)}
              className="mt-3 cursor-pointer text-zinc-500 underline underline-offset-2 transition hover:text-zinc-300"
            >
              Clear all data from this browser
            </button>
          </>
        )}
      </footer>
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
