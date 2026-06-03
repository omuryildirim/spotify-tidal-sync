/** Backend server + OAuth redirect configuration (single local port). */

export const BACKEND_PORT = Number(process.env.PORT ?? 8888);
export const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

/** Where to send the browser after an OAuth callback completes (Vite dev server in dev). */
export const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? BACKEND_ORIGIN;

/** These must be registered as Redirect URIs on the respective developer apps. */
export const SPOTIFY_REDIRECT_URI = `${BACKEND_ORIGIN}/api/auth/spotify/callback`;
export const TIDAL_REDIRECT_URI = `${BACKEND_ORIGIN}/api/auth/tidal/callback`;
