import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { session } from './session.js';
import { BACKEND_PORT, FRONTEND_ORIGIN, SPOTIFY_REDIRECT_URI, TIDAL_REDIRECT_URI } from './config.js';
import { buildSpotifyAuthUrl, completeSpotifyLogin } from '../spotify/auth.js';
import { getTidalLoginUrl, finalizeTidalLogin } from '../tidal/auth.js';
import { withTimeout } from '../util/timeout.js';
import { dryRun, runSync } from '../sync/engine.js';
import type { SyncMapping, SyncPlan } from '../sync/types.js';
import { loadSyncHistory, recordSync } from '../sync/history.js';

const app = new Hono();
const api = new Hono();

api.get('/status', async (c) => c.json(await session.status()));

api.get('/credentials', (c) => c.json(session.credentials));

api.post('/credentials', async (c) => {
  const body = (await c.req.json()) as {
    spotify?: { clientId: string; clientSecret: string };
    tidal?: { clientId: string; clientSecret: string };
  };
  session.updateCredentials(body);
  return c.json({ ok: true });
});

// --- Spotify OAuth ---
api.get('/auth/spotify/login', (c) => {
  if (!session.credentials.spotify.clientId) return c.json({ error: 'Set Spotify credentials first' }, 400);
  return c.json({ url: buildSpotifyAuthUrl(session.spotifyConfig()) });
});

api.get('/auth/spotify/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  if (error || !code) return c.redirect(`${FRONTEND_ORIGIN}/?error=spotify`);
  try {
    // Store the token and return immediately; the client is built lazily on /status.
    await withTimeout(completeSpotifyLogin(session.spotifyConfig(), code), 15_000, 'Spotify token exchange');
    return c.redirect(`${FRONTEND_ORIGIN}/?connected=spotify`);
  } catch (err) {
    console.error('[spotify callback]', err);
    return c.redirect(`${FRONTEND_ORIGIN}/?error=spotify`);
  }
});

// --- TIDAL OAuth ---
api.get('/auth/tidal/login', async (c) => {
  if (!session.credentials.tidal.clientId) return c.json({ error: 'Set TIDAL credentials first' }, 400);
  await session.ensureTidalInit();
  return c.json({ url: await getTidalLoginUrl(TIDAL_REDIRECT_URI) });
});

api.get('/auth/tidal/callback', async (c) => {
  const search = new URL(c.req.url).search;
  if (!c.req.query('code')) return c.redirect(`${FRONTEND_ORIGIN}/?error=tidal`);
  try {
    await session.ensureTidalInit();
    // Store the token and return immediately; the client is built lazily on /status.
    await withTimeout(finalizeTidalLogin(search), 15_000, 'TIDAL token exchange');
    return c.redirect(`${FRONTEND_ORIGIN}/?connected=tidal`);
  } catch (err) {
    console.error('[tidal callback]', err);
    return c.redirect(`${FRONTEND_ORIGIN}/?error=tidal`);
  }
});

// --- Spotify playlists ---
api.get('/playlists', async (c) => {
  try {
    const spotify = await session.requireSpotify();
    const playlists = await spotify.getMyPlaylists();
    return c.json({ playlists });
  } catch (err) {
    console.error('[playlists]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed to load playlists' }, 500);
  }
});

api.get('/playlists/:id/tracks', async (c) => {
  try {
    const spotify = await session.requireSpotify();
    const tracks = await spotify.getPlaylistTracks(c.req.param('id'));
    return c.json({ tracks });
  } catch (err) {
    console.error('[playlist tracks]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed to load tracks' }, 500);
  }
});

api.get('/spotify/liked', async (c) => {
  try {
    const spotify = await session.requireSpotify();
    return c.json({ total: await spotify.getLikedCount() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

api.get('/spotify/liked/tracks', async (c) => {
  try {
    const spotify = await session.requireSpotify();
    return c.json({ tracks: await spotify.getLikedTracks() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

// --- TIDAL library ---
api.get('/tidal/playlists', async (c) => {
  try {
    const tidal = await session.requireTidal();
    return c.json({ playlists: await tidal.getPlaylists() });
  } catch (err) {
    console.error('[tidal playlists]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

api.get('/tidal/playlists/:id/tracks', async (c) => {
  try {
    const tidal = await session.requireTidal();
    return c.json({ tracks: await tidal.getPlaylistTracks(c.req.param('id')) });
  } catch (err) {
    console.error('[tidal playlist tracks]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

api.get('/tidal/track/:id', async (c) => {
  try {
    const tidal = await session.requireTidal();
    const track = await tidal.getTrack(c.req.param('id'));
    if (!track) return c.json({ error: 'Track not found on TIDAL' }, 404);
    return c.json({ track });
  } catch (err) {
    console.error('[tidal track]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

api.get('/tidal/favorites/tracks', async (c) => {
  try {
    const tidal = await session.requireTidal();
    return c.json({ tracks: await tidal.getFavoriteTracks() });
  } catch (err) {
    console.error('[tidal favorites]', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed' }, 500);
  }
});

// --- Sync (dry run: match only, no writes to TIDAL) ---
// Streams newline-delimited JSON events (meta → progress… → source-done… ) as matching proceeds.
api.post('/sync/dry-run', async (c) => {
  const { mappings } = (await c.req.json()) as { mappings: SyncMapping[] };
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return c.json({ error: 'No sources selected' }, 400);
  }
  let spotify, tidal;
  try {
    [spotify, tidal] = await Promise.all([session.requireSpotify(), session.requireTidal()]);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Not connected' }, 500);
  }
  const sp = spotify;
  const td = tidal;

  c.header('Content-Type', 'application/x-ndjson');
  c.header('Cache-Control', 'no-cache');
  return stream(c, async (s) => {
    const write = (event: unknown) => s.write(JSON.stringify(event) + '\n');
    try {
      await dryRun(sp, td, mappings, session.matchCache, {
        onMeta: (meta) => void write({ type: 'meta', ...meta }),
        onProgress: (done, total) => void write({ type: 'progress', done, total }),
        onSourceDone: (result) => void write({ type: 'source-done', result }),
      });
      await write({ type: 'done' });
    } catch (err) {
      console.error('[sync dry-run]', err);
      await write({ type: 'error', error: err instanceof Error ? err.message : 'Dry run failed' });
    }
  });
});

// Last successful sync per source (for "last synced" badges in the UI).
api.get('/sync/history', (c) => c.json(loadSyncHistory()));

// Clear the in-memory match cache (forces fresh TIDAL lookups on the next dry run).
api.post('/sync/cache/clear', (c) => {
  const cleared = session.matchCache.size;
  session.matchCache.clear();
  return c.json({ cleared });
});

// --- Sync (write to TIDAL, preserving Spotify order) ---
api.post('/sync/run', async (c) => {
  const { plans } = (await c.req.json()) as { plans: SyncPlan[] };
  if (!Array.isArray(plans) || plans.length === 0) {
    return c.json({ error: 'Nothing to sync' }, 400);
  }
  let spotify, tidal;
  try {
    [spotify, tidal] = await Promise.all([session.requireSpotify(), session.requireTidal()]);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Not connected' }, 500);
  }
  const sp = spotify;
  const td = tidal;

  c.header('Content-Type', 'application/x-ndjson');
  c.header('Cache-Control', 'no-cache');
  return stream(c, async (s) => {
    const write = (event: unknown) => s.write(JSON.stringify(event) + '\n');
    try {
      const syncedAt = new Date().toISOString();
      await runSync(sp, td, plans, {
        onMeta: (meta) => void write({ type: 'meta', ...meta }),
        onProgress: (done, total) => void write({ type: 'progress', done, total }),
        onPlanDone: (result) => {
          if (!result.error) {
            recordSync({
              sourceId: result.sourceId,
              sourceName: result.sourceName,
              destinationKind: result.destination.kind,
              tidalPlaylistId: result.playlistId,
              tidalPlaylistName: result.playlistName,
              added: result.added,
              total: result.requested,
              syncedAt,
            });
          }
          void write({ type: 'plan-done', result });
        },
      });
      await write({ type: 'done' });
    } catch (err) {
      console.error('[sync run]', err);
      await write({ type: 'error', error: err instanceof Error ? err.message : 'Sync failed' });
    }
  });
});

app.route('/api', api);

// In production, serve the built frontend (Vite outputs to web/dist).
app.use('/*', serveStatic({ root: './web/dist' }));
app.get('/*', serveStatic({ path: './web/dist/index.html' }));

serve({ fetch: app.fetch, port: BACKEND_PORT }, (info) => {
  console.log(`API + app listening on http://127.0.0.1:${info.port}`);
  console.log(`Spotify redirect URI: ${SPOTIFY_REDIRECT_URI}`);
  console.log(`TIDAL   redirect URI: ${TIDAL_REDIRECT_URI}`);
});
