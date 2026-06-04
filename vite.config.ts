import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  // Spotify requires 127.0.0.1 (not localhost) for loopback redirect URIs.
  server: { host: '127.0.0.1', port: 5173, open: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
