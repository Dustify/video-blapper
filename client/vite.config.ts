// client/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Client runs on port 3000
    host: true,
    proxy: {
      // Forward API requests
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // ALSO forward screenshot requests
      '/screenshots': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})