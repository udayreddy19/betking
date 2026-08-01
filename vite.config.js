import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fancodeApiPlugin } from './vite-plugins/fancodeApi.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), fancodeApiPlugin()],
})
