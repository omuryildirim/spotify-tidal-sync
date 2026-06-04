# spotify-tidal-sync

Move your Spotify playlists and Liked Songs to TIDAL through a **browser-only** web app — no server, no install. It matches each track to TIDAL (ISRC first, with a smart fallback), lets you review and fix anything before writing, and keeps your playlist order intact. Everything runs in your browser and talks straight to Spotify and TIDAL; your tokens never leave your machine.

> **Use it now: [sync.ignorethedark.com](https://sync.ignorethedark.com)** — a hosted build of this exact code, so you can sync without cloning or running anything. It's a static page: nothing is sent to or stored on a server; everything still happens in your browser.

## Screenshots

Connect both accounts with your own API credentials:

![Connect screen](docs/images/login.png)

Browse your Spotify playlists and Liked Songs alongside your TIDAL library, and pick what to sync:

![Library browser](docs/images/playlists.png)

Review the matches before anything is written — resolve unmatched tracks, handle duplicates, and choose options like preserving order in Favorites:

![Review screen](docs/images/preview.png)

Then sync, keeping your exact Spotify order:

![Sync progress](docs/images/sync.png)

## Getting started

**Requirements:** [Node.js](https://nodejs.org) ≥ 22 and [pnpm](https://pnpm.io) (to run/build), plus your own developer apps for [Spotify](https://developer.spotify.com/dashboard) and [TIDAL](https://developer.tidal.com).

The app uses the **Authorization Code + PKCE** flow, so register both as **public** clients — **no client secret is needed**. Set the redirect URI on each app to the URL where the app runs:

- Local dev: `http://127.0.0.1:5173/`
- If you deploy it: your site's origin, e.g. `https://your-app.example/`

Then run:

```bash
pnpm install
pnpm dev
```

This opens the app at <http://127.0.0.1:5173>. Paste each service's **Client ID** to connect, pick what to sync and where, review the matches, and confirm.

## Features

- **ISRC-first matching** with a fuzzy title/artist/duration fallback.
- **Review before writing** — resolve unmatched tracks by picking a suggestion or pasting a TIDAL link; nothing is written until you confirm.
- **Order preserved** — new playlists mirror the Spotify order exactly.
- **Flexible destinations** — a new TIDAL playlist, an existing one (append-only), or your TIDAL Favorites.
- **Duplicate handling**, **live progress**, a **match cache** for fast re-runs, and a **"last synced" badge** per playlist.

## Where your data lives

Everything stays in your **browser's `localStorage`** — your client IDs, OAuth tokens, and sync history. There is no server and no database; the app only ever talks to Spotify and TIDAL directly. Clearing your browser data (or using the in-app controls) removes it.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Run the app with hot reload |
| `pnpm build` | Type-check and build the static site |
| `pnpm preview` | Serve the production build locally |
| `pnpm test` | Run the unit tests |

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — free for any **noncommercial** use (personal, hobby, research, education, nonprofits). Commercial use is not permitted.
