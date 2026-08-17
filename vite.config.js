import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveScoresApiPlugin } from './vite-plugins/liveScoresApi.js'
import { sportsApiPlatformPlugin } from './vite-plugins/sportsApiPlatform.js'

// https://vite.dev/config/
export default defineConfig({
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
  plugins: [react(), liveScoresApiPlugin(), sportsApiPlatformPlugin()],
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
          // Split each itshover icon into its own chunk
          if (id.includes('/src/icons/itshover/')) {
            const match = id.match(/\/src\/icons\/itshover\/([^/]+)\./);
            if (match) {
              return `icon-${match[1].replace('-icon', '')}`;
            }
            return 'icons-itshover';
          }
        },
      },
    },
  },
})
