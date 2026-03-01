import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5055,
    strictPort: true,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:5060',
        changeOrigin: true,
      }
    }
  }
})
