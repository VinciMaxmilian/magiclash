import { defineConfig, loadEnv } from 'vite';

/** Public values baked into the bundle at build time. A production build without them "works" but talks to nothing. */
const REQUIRED_IN_PRODUCTION = ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;

export default defineConfig(({ mode }) => {
  if (mode === 'production') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    const missing = REQUIRED_IN_PRODUCTION.filter((k) => !env[k]?.trim());
    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(', ')} for the production build. Set them in the host's build environment ` +
          '(Netlify: Site configuration → Environment variables, scope "Builds") and redeploy.',
      );
    }
    if (!/^https:\/\//.test(env.VITE_API_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(env.VITE_API_URL)) {
      throw new Error('VITE_API_URL must be an absolute https:// URL (e.g. https://magiclash.onrender.com).');
    }
  }
  return {
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
  };
});
