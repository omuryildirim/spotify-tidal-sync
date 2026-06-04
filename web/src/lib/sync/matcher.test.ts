import { describe, it, expect } from 'vitest';
import { match, isrcMatch, nameMatch, artistMatch, durationMatch, simple, normalize } from './matcher';
import type { SpotifyTrack } from '../spotify/types';
import type { TidalTrack } from '../tidal/types';

function sp(overrides: Partial<SpotifyTrack> = {}): SpotifyTrack {
  return { id: 's1', name: 'Song', artists: ['Artist'], durationMs: 180_000, isrc: 'AAA111', ...overrides };
}
function td(overrides: Partial<TidalTrack> = {}): TidalTrack {
  return { id: 't1', title: 'Song', artists: ['Artist'], durationSeconds: 180, isrc: 'AAA111', ...overrides };
}

describe('helpers', () => {
  it('simple() strips version suffixes and brackets', () => {
    expect(simple('Song - Remastered')).toBe('Song');
    expect(simple('Song (feat. X)')).toBe('Song');
    expect(simple('Song [Live]')).toBe('Song');
  });
  it('normalize() strips diacritics', () => {
    expect(normalize('Beyoncé')).toBe('Beyonce');
    expect(normalize('Mötley')).toBe('Motley');
  });
});

describe('isrcMatch', () => {
  it('matches identical ISRCs', () => expect(isrcMatch(td(), sp())).toBe(true));
  it('fails on different ISRCs', () => expect(isrcMatch(td({ isrc: 'BBB' }), sp())).toBe(false));
  it('fails when an ISRC is missing', () => expect(isrcMatch(td({ isrc: undefined }), sp())).toBe(false));
});

describe('durationMatch', () => {
  it('matches within 2s tolerance', () => expect(durationMatch(td({ durationSeconds: 181 }), sp())).toBe(true));
  it('fails beyond tolerance', () => expect(durationMatch(td({ durationSeconds: 185 }), sp())).toBe(false));
});

describe('nameMatch', () => {
  it('matches simplified substring', () =>
    expect(nameMatch(td({ title: 'Song (Remastered 2009)' }), sp({ name: 'Song' }))).toBe(true));
  it('rejects mismatched remix qualifier', () =>
    expect(nameMatch(td({ title: 'Song (Club Remix)' }), sp({ name: 'Song' }))).toBe(false));
  it('matches when both are remixes', () =>
    expect(nameMatch(td({ title: 'Song (Club Remix)' }), sp({ name: 'Song - Remix' }))).toBe(true));
});

describe('artistMatch', () => {
  it('matches overlapping artist', () =>
    expect(artistMatch(td({ artists: ['Foo', 'Bar'] }), sp({ artists: ['Bar'] }))).toBe(true));
  it('matches across & separators', () =>
    expect(artistMatch(td({ artists: ['Foo & Bar'] }), sp({ artists: ['Bar'] }))).toBe(true));
  it('fails with no overlap', () =>
    expect(artistMatch(td({ artists: ['Foo'] }), sp({ artists: ['Baz'] }))).toBe(false));
});

describe('match', () => {
  it('matches purely on ISRC even if name/artist differ', () =>
    expect(match(td({ title: 'Totally Different', artists: ['Nobody'] }), sp())).toBe(true));
  it('matches on duration+name+artist when ISRC differs', () =>
    expect(match(td({ isrc: 'ZZZ' }), sp())).toBe(true));
  it('fails when ISRC differs and duration is off', () =>
    expect(match(td({ isrc: 'ZZZ', durationSeconds: 240 }), sp())).toBe(false));
  it('fails on empty spotify id', () => expect(match(td(), sp({ id: '' }))).toBe(false));
});
