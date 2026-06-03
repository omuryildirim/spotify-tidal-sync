# CLAUDE.md

Guidance for working in this repo.

## What this is

A local web app to sync Spotify playlists/Liked Songs into TIDAL. TypeScript end to end: a Hono API backend and a React (Vite + Tailwind) frontend.

## Commands

```bash
pnpm dev        # API (:8888) + web (:5173) with hot reload
pnpm build      # tsc + vite build
pnpm start      # run the built app on :8888
pnpm typecheck  # backend + frontend type-check
pnpm test       # vitest
```

Run `pnpm typecheck` and `pnpm test` before committing.

## Layout

- `src/server` — Hono app: REST + NDJSON streaming endpoints, OAuth callbacks, static serving.
- `src/spotify` — Spotify OAuth + Web API client.
- `src/tidal` — TIDAL OAuth (PKCE) + JSON:API client (with retry/backoff).
- `src/sync` — `matcher.ts` (ISRC + fuzzy), `engine.ts` (dry-run + order-preserving write), `history.ts`.
- `src/util` — paths, credential storage, helpers.
- `web/src` — React app (`App.tsx`, `api.ts`, `components/`).
- `tests` — Vitest unit tests for the matcher and sync engine.

## Conventions

- Strict TypeScript, ESM. Backend uses NodeNext resolution (`.js` import specifiers); frontend uses the bundler resolver.
- Prefer the existing layering: the server depends on `sync`/`spotify`/`tidal`; those never import from `server` or `web`.
- Keep TIDAL/Spotify network access inside their client modules; the sync engine talks to the `TidalClient` interface, not the raw API.
- Local state (tokens, credentials, history) lives in `~/.spotify-tidal-sync/` — never commit secrets.
- Add or update a Vitest test when changing matching or sync-engine behavior.
