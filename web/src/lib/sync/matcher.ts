import type { SpotifyTrack } from '../spotify/types';
import type { TidalTrack } from '../tidal/types';

/** Strip diacritics and non-ASCII (mirrors the Python NFD + ascii-ignore normalization). */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[^\x00-\x7F]/g, '');
}

/** Take the part of a string before any hyphen or bracket, to ignore version suffixes. */
export function simple(input: string): string {
  return input.split('-')[0]!.trim().split('(')[0]!.trim().split('[')[0]!.trim();
}

export function isrcMatch(tidal: TidalTrack, spotify: SpotifyTrack): boolean {
  return Boolean(spotify.isrc && tidal.isrc && tidal.isrc === spotify.isrc);
}

export function durationMatch(tidal: TidalTrack, spotify: SpotifyTrack, toleranceSeconds = 2): boolean {
  if (tidal.durationSeconds === undefined) return false;
  return Math.abs(tidal.durationSeconds - spotify.durationMs / 1000) < toleranceSeconds;
}

export function nameMatch(tidal: TidalTrack, spotify: SpotifyTrack): boolean {
  const tidalText = `${tidal.title.toLowerCase()} ${(tidal.version ?? '').toLowerCase()}`;
  const spotifyName = spotify.name.toLowerCase();

  // A qualifier present on one side but not the other rules out the match.
  const exclusion = (pattern: string): boolean =>
    spotifyName.includes(pattern) !== tidalText.includes(pattern);
  if (exclusion('instrumental') || exclusion('acapella') || exclusion('remix')) return false;

  const simpleSpotify = simple(spotifyName).split('feat.')[0]!.trim();
  const tidalTitle = tidal.title.toLowerCase();
  return tidalTitle.includes(simpleSpotify) || normalize(tidalTitle).includes(normalize(simpleSpotify));
}

function splitArtistName(artist: string): string[] {
  if (artist.includes('&')) return artist.split('&');
  if (artist.includes(',')) return artist.split(',');
  return [artist];
}

function artistSet(artists: string[], doNormalize: boolean): Set<string> {
  const result: string[] = [];
  for (const artist of artists) {
    const name = doNormalize ? normalize(artist) : artist;
    result.push(...splitArtistName(name));
  }
  return new Set(result.map((x) => simple(x.trim().toLowerCase())));
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function artistMatch(tidal: TidalTrack, spotify: SpotifyTrack): boolean {
  if (intersects(artistSet(tidal.artists, false), artistSet(spotify.artists, false))) return true;
  return intersects(artistSet(tidal.artists, true), artistSet(spotify.artists, true));
}

/** A Tidal track matches a Spotify track if the ISRC matches, or duration+name+artist all match. */
export function match(tidal: TidalTrack, spotify: SpotifyTrack): boolean {
  if (!spotify.id) return false;
  return (
    isrcMatch(tidal, spotify) ||
    (durationMatch(tidal, spotify) && nameMatch(tidal, spotify) && artistMatch(tidal, spotify))
  );
}

/** Pick the best Tidal candidate for a Spotify track, preferring an ISRC match. */
export function bestMatch(candidates: TidalTrack[], spotify: SpotifyTrack): TidalTrack | undefined {
  return candidates.find((c) => isrcMatch(c, spotify)) ?? candidates.find((c) => match(c, spotify));
}
