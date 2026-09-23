import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    // Dev tools (debug overlay, slow-mo, data validation logs) are gated on the Vite MODE,
    // not on NODE_ENV: a machine with NODE_ENV=development must still produce clean
    // production builds. `false` lets Rollup drop the code and the chunk entirely.
    __DEV_TOOLS__: JSON.stringify(mode !== 'production'),
  },
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Phaser is big and changes rarely: separate chunk = better long-term caching.
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
    chunkSizeWarningLimit: 1600,
  },
}));
