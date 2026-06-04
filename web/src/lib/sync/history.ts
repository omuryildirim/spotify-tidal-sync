import { getJSON, setJSON } from '../storage';

/** A record of the most recent successful sync of one Spotify source. */
export interface SyncHistoryEntry {
  sourceId: string;
  sourceName: string;
  destinationKind: 'new' | 'existing' | 'favorites';
  tidalPlaylistId?: string;
  tidalPlaylistName?: string;
  added: number;
  total: number;
  syncedAt: string; // ISO-8601
}

/** Keyed by Spotify source id (e.g. a playlist id, or 'liked'). */
export type SyncHistory = Record<string, SyncHistoryEntry>;

const KEY = 'syncHistory';

export function loadSyncHistory(): SyncHistory {
  return getJSON<SyncHistory>(KEY, {});
}

/** Persist the latest sync for a source (overwrites any previous entry for that source). */
export function recordSync(entry: SyncHistoryEntry): void {
  const history = loadSyncHistory();
  history[entry.sourceId] = entry;
  setJSON(KEY, history);
}
