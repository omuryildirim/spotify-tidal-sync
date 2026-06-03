# spotify-tidal-sync

Import and sync your **Spotify** playlists and Liked Songs into **TIDAL** — through a small local web app. Match quality first: ISRC-exact matching, a fuzzy fallback, and a review screen where you resolve anything that didn't match before a single track is written. Playlist order is preserved exactly.

![stack](https://img.shields.io/badge/stack-TypeScript%20·%20React%20·%20Hono-blue)

## Features

- **Side-by-side connect screen** — paste your Spotify and TIDAL app credentials; tokens are stored locally, no config file to hand-edit.
- **Browse both libraries** — your Spotify playlists + Liked Songs on one side, your TIDAL playlists + Favorites on the other. Drill into any of them to see the tracks.
- **Dry run before writing** — match every selected track to TIDAL and review the result. Nothing is written until you confirm.
  - **ISRC-first matching** (batched), with a cleaned-query text-search fallback scored on title + artist + duration.
  - **Resolve unmatched tracks** by picking from suggested alternatives or pasting a TIDAL track link.
  - **Duplicate handling** — duplicates in a Spotify playlist are surfaced; choose to mirror them or collapse them.
- **Order-preserving sync** — new playlists mirror the Spotify order exactly.
- **Flexible destinations** — create a new TIDAL playlist, append into an existing one (non-destructive), or add Liked Songs to your TIDAL Favorites.
- **Resilient to rate limits** — gentle request rate with automatic retry/backoff on TIDAL throttling, plus a match cache so re-runs are fast.
- **Live progress + sync history** — a progress bar during matching and writing, and a "last synced" badge per source.

## Requirements

- **Node.js ≥ 22** and **[pnpm](https://pnpm.io/)**
- A **Spotify** app — create one at <https://developer.spotify.com/dashboard>
- A **TIDAL** app — create one at <https://developer.tidal.com>

When creating the apps, register these **Redirect URIs**:

| Service | Redirect URI |
| --- | --- |
| Spotify | `http://127.0.0.1:8888/api/auth/spotify/callback` |
| TIDAL   | `http://127.0.0.1:8888/api/auth/tidal/callback` |

You'll need each app's **Client ID** and **Client Secret**.

## Quick start

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts the API (port `8888`) and the Vite dev server, and opens the app at <http://localhost:5173>.

1. On the connect screen, paste your Spotify and TIDAL **Client ID / Secret** and connect each (you'll be redirected to authorize).
2. Pick the playlists (and/or Liked Songs) to sync and choose a destination for each.
3. Hit **Sync** to run a dry run, review the matches, resolve anything unmatched, and confirm.

## Running the built app

```bash
pnpm build   # type-checks, bundles the server, builds the web UI
pnpm start   # serves the app + API on http://127.0.0.1:8888
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run API + web with hot reload |
| `pnpm build` | Type-check, compile the server, build the frontend |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | Type-check backend and frontend |
| `pnpm test` | Run the unit tests (Vitest) |

## How it works

- **Backend** — a [Hono](https://hono.dev) server (`src/server`) exposing the REST + streaming API and serving the built frontend in production.
- **Spotify** (`src/spotify`) — OAuth (Authorization Code) and a thin Web API client.
- **TIDAL** (`src/tidal`) — OAuth (Authorization Code + PKCE) via the official `@tidal-music` SDK, and a JSON:API client with retry/backoff.
- **Sync engine** (`src/sync`) — the matcher, the dry-run pass, and the order-preserving write pass.
- **Web UI** (`web`) — a React + Tailwind single-page app.

Credentials, tokens and sync history live under `~/.spotify_to_tidal/` (credentials files are written with `0600` permissions). Nothing sensitive is committed to the repo.

## License

MIT
