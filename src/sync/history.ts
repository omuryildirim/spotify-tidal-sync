import { readFileSync, writeFileSync } from 'node:fs';
import { stateFile, SYNC_HISTORY_FILE } from '../util/paths.js';

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

export function loadSyncHistory(): SyncHistory {
  try {
    return JSON.parse(readFileSync(stateFile(SYNC_HISTORY_FILE), 'utf8')) as SyncHistory;
  } catch {
    return {};
  }
}

/** Persist the latest sync for a source (overwrites any previous entry for that source). */
export function recordSync(entry: SyncHistoryEntry): void {
  const history = loadSyncHistory();
  history[entry.sourceId] = entry;
  writeFileSync(stateFile(SYNC_HISTORY_FILE), JSON.stringify(history, null, 2));
}
