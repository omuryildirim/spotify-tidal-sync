/** Shared OAuth configuration for the browser app. */

export type Service = 'spotify' | 'tidal';

export const SPOTIFY_SCOPES = ['playlist-read-private', 'user-library-read', 'playlist-modify-private', 'playlist-modify-public', 'user-library-modify'];

export const TIDAL_SCOPES = [
  'user.read',
  'collection.read',
  'collection.write',
  'playlists.read',
  'playlists.write',
];

/**
 * Redirect URI for both OAuth flows. Both services must have this exact URL registered. The SPA
 * reads `?code=…&state=…` off this URL on load and finalizes the login.
 *
 * Defaults to the app's own origin, which is right for local dev and most static deploys. Set
 * `VITE_REDIRECT_URI` at build time to pin it explicitly (e.g. on Cloudflare Pages, when the
 * registered URL must differ from the runtime origin — preview URLs, custom domains, etc.).
 */
export function redirectUri(): string {
  const configured = import.meta.env.VITE_REDIRECT_URI?.trim();
  return configured ? configured : window.location.origin + '/';
}
