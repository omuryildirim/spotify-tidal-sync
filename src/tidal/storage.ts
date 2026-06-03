import { readFileSync, writeFileSync } from 'node:fs';
import type { StorageAdapter, CryptoAdapter } from '@tidal-music/auth';
import { stateFile, TIDAL_CREDENTIALS_FILE } from '../util/paths.js';

/**
 * File-backed key/value store implementing the auth module's StorageAdapter.
 * The browser default is localStorage, which does not exist in Node, so we
 * persist the credential blob to a JSON file under the state dir instead.
 */
export function createFileStorage(fileName = TIDAL_CREDENTIALS_FILE): StorageAdapter {
  const path = stateFile(fileName);

  const readAll = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  };

  const writeAll = (data: Record<string, string>): void => {
    writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
  };

  return {
    async load(key: string): Promise<string | null> {
      return readAll()[key] ?? null;
    },
    async save(key: string, value: string): Promise<void> {
      const data = readAll();
      data[key] = value;
      writeAll(data);
    },
    async remove(key: string): Promise<void> {
      const data = readAll();
      delete data[key];
      writeAll(data);
    },
  };
}

/**
 * The auth module needs Web Crypto (digest + getRandomValues) for PKCE.
 * Node 20+ exposes a Web Crypto implementation on globalThis.crypto.
 */
export const nodeCrypto: CryptoAdapter = {
  digest: (algorithm: string, data: BufferSource) => globalThis.crypto.subtle.digest(algorithm, data),
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T =>
    globalThis.crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T,
};
