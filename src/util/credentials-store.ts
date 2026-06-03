import { readFileSync, writeFileSync } from 'node:fs';
import { stateFile } from './paths.js';

const FILE = 'app-credentials.json';

export interface ServiceCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AppCredentials {
  spotify: ServiceCredentials;
  tidal: ServiceCredentials;
}

const EMPTY: AppCredentials = {
  spotify: { clientId: '', clientSecret: '' },
  tidal: { clientId: '', clientSecret: '' },
};

/** Load previously entered client credentials (so the user need not retype them). */
export function loadCredentials(): AppCredentials {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(FILE), 'utf8')) as Partial<AppCredentials>;
    return {
      spotify: { ...EMPTY.spotify, ...parsed.spotify },
      tidal: { ...EMPTY.tidal, ...parsed.tidal },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveCredentials(credentials: AppCredentials): void {
  writeFileSync(stateFile(FILE), JSON.stringify(credentials, null, 2), { mode: 0o600 });
}
