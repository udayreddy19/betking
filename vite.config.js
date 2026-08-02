import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveScoresApiPlugin } from './vite-plugins/liveScoresApi.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liveScoresApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-router') || id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/react-icons')) {
            return 'icons';
          }
        },
      },
    },
  },
})
