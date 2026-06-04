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
 * Redirect URI for both OAuth flows: the app's own origin. Both services must have this exact URL
 * registered. The SPA reads `?code=…&state=…` off this URL on load and finalizes the login.
 */
export function redirectUri(): string {
  return window.location.origin + '/';
}
