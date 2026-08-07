import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveScoresApiPlugin } from './vite-plugins/liveScoresApi.js'
import { sportsApiPlatformPlugin } from './vite-plugins/sportsApiPlatform.js'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  plugins: [react(), liveScoresApiPlugin(), sportsApiPlatformPlugin()],
  build: {
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
