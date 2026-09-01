import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveScoresApiPlugin } from './vite-plugins/liveScoresApi.js'
import { sportsApiPlatformPlugin } from './vite-plugins/sportsApiPlatform.js'
import rejectDemoModeProductionPlugin from './vite-plugins/rejectDemoModeProduction.js'

const cdnOrigin = (process.env.VITE_CDN_ASSET_ORIGIN || '').replace(/\/$/, '');
const assetBase = cdnOrigin ? `${cdnOrigin}/` : '/';

// https://vite.dev/config/
export default defineConfig({
  base: assetBase,
  resolve: {
    dedupe: ['react', 'react-dom', 'motion'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:5001',
        ws: true,
      },
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        bypass(req) {
          const path = req.url?.split('?')[0] || '';
          if (
            path === '/api/live-scores'
            || path === '/api/match-detail'
            || /^\/api\/public\/sports\/matches\/[^/]+\/odds$/.test(path)
          ) {
            return req.url;
          }
        },
      },
    },
  },
  plugins: [react(), liveScoresApiPlugin(), sportsApiPlatformPlugin(), rejectDemoModeProductionPlugin()],
  build: {
    target: ['es2019', 'safari13', 'chrome80', 'firefox78', 'edge88'],
    cssTarget: ['safari13', 'chrome80', 'firefox78', 'edge88'],
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router') || id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/@animateicons')) {
            return 'icons-animateicons';
          }
          if (id.includes('node_modules/motion')) {
            return 'icons-motion';
          }
          if (id.includes('/src/icons/itshover/')) {
            return 'icons-itshover';
          }
        },
      },
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/coverage/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'lib/betPlacementEngine.mjs',
        'lib/withdrawalEngine.mjs',
        'lib/depositEngine.mjs',
        'lib/odds-v3/OddsEngineV3.mjs',
      ],
      thresholds: {
        lines: 60,
        functions: 70,
        statements: 60,
        branches: 45,
      },
    },
  },
})
