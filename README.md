# spotify-tidal-sync

Move your Spotify playlists and Liked Songs to TIDAL through a small local web app. It matches each track to TIDAL (ISRC first, with a smart fallback), lets you review and fix anything before writing, and keeps your playlist order intact.

## Screenshots

<!-- Add screenshots here -->

_Coming soon._

## Getting started

**Requirements:** [Node.js](https://nodejs.org) ≥ 22, [pnpm](https://pnpm.io), and your own developer apps for [Spotify](https://developer.spotify.com/dashboard) and [TIDAL](https://developer.tidal.com).

When creating those apps, register these redirect URIs:

- **Spotify** — `http://127.0.0.1:8888/api/auth/spotify/callback`
- **TIDAL** — `http://127.0.0.1:8888/api/auth/tidal/callback`

Then run:

```bash
pnpm install
pnpm dev
```

This opens the app at <http://localhost:5173>. Paste each service's **Client ID** and **Client Secret** to connect, pick what to sync and where, review the matches, and confirm.

To run the production build instead: `pnpm build && pnpm start` (serves everything on <http://127.0.0.1:8888>).

## Features

- **ISRC-first matching** with a fuzzy title/artist/duration fallback.
- **Review before writing** — resolve unmatched tracks by picking a suggestion or pasting a TIDAL link; nothing is written until you confirm.
- **Order preserved** — new playlists mirror the Spotify order exactly.
- **Flexible destinations** — a new TIDAL playlist, an existing one (append-only), or your TIDAL Favorites.
- **Duplicate handling**, **live progress**, a **match cache** for fast re-runs, and a **"last synced" badge** per playlist.

## Where your data lives

Everything stays on your machine, under `~/.spotify_to_tidal/`:

- `app-credentials.json`, `spotify-token.json`, `tidal-credentials.json` — your API keys and OAuth tokens (written with `0600` permissions)
- `sync-history.json` — the last sync for each source

Data is only ever sent to Spotify and TIDAL directly, and none of it is committed to the repo.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the app with hot reload |
| `pnpm build` | Type-check and build for production |
| `pnpm start` | Run the production build |
| `pnpm test` | Run the unit tests |

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — free for any **noncommercial** use (personal, hobby, research, education, nonprofits). Commercial use is not permitted.
