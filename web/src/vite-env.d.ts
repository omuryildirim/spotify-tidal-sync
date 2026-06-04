/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional explicit OAuth redirect URI; falls back to the runtime origin when unset. */
  readonly VITE_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
