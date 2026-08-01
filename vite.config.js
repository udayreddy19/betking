import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cricbuzzApiPlugin } from './vite-plugins/cricbuzzApi.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cricbuzzApiPlugin()],
})
