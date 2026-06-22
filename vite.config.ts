import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.FINANZAS_API_URL ?? 'http://127.0.0.1:4147'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
})
