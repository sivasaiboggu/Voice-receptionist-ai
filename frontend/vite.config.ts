import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // BrowserRouter routes are served from the site root on Vercel and preview.
  server: {
    port: 5174,
    // Dev-only convenience: VITE_API_URL=/api proxies to the local backend
    // (stripping the /api prefix) so the dashboard works without CORS.
    // The app itself defaults to http://localhost:8001 in dev; this proxy
    // is only used when VITE_API_URL is explicitly set to /api.
    proxy: { '/api': { target: 'http://localhost:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
