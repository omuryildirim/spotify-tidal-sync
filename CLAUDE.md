# CLAUDE.md

Guidance for working in this repo.

## What this is

A **browser-only** web app to sync Spotify playlists/Liked Songs into TIDAL. No backend — a React (Vite + Tailwind) SPA that talks directly to the Spotify and TIDAL APIs using Authorization Code + PKCE (public clients, no secrets). All state lives in `localStorage`.

## Commands

```bash
pnpm dev        # Vite dev server on http://127.0.0.1:5173
pnpm build      # type-check + static build to web/dist
pnpm preview    # serve the build locally
pnpm typecheck  # tsc -p web/tsconfig.json --noEmit
pnpm test       # vitest
```

Run `pnpm typecheck` and `pnpm test` before committing.

## Layout

Vite root is `web/`. All code lives under `web/src`:

- `web/src/lib/spotify` — PKCE auth + fetch-only Web API client.
- `web/src/lib/tidal` — PKCE auth (`@tidal-music` SDK) + JSON:API client (retry/backoff).
- `web/src/lib/sync` — `matcher.ts` (ISRC + fuzzy), `engine.ts` (dry-run + order-preserving write), `history.ts`, plus `*.test.ts`.
- `web/src/lib/storage.ts`, `session.ts`, `config.ts` — localStorage, the in-browser session, OAuth config.
- `web/src/api.ts` — the data layer the UI calls (wraps `session` + the engine).
- `web/src/App.tsx`, `web/src/components/` — the UI.

## Conventions

- Strict TypeScript, ESM, bundler module resolution — relative imports are **extensionless** (`./foo`, not `./foo.js`).
- Keep the layering: `api.ts`/UI depend on `lib`; `lib/sync` talks to the `TidalClient`/`SpotifyClient` interfaces, not raw APIs. Network access stays inside the client modules.
- No secrets: both services are public PKCE clients. All persistence is `localStorage` — never add a server or commit credentials.
- Add or update a Vitest test when changing matching or sync-engine behavior.
