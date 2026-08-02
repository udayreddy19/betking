import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { liveScoresApiPlugin } from './vite-plugins/liveScoresApi.js'
import { casinoApiPlugin } from './vite-plugins/casinoApi.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liveScoresApiPlugin(), casinoApiPlugin()],
})
