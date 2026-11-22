import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the default absolute /assets/... makes a
  // file:// render (and a GitHub Pages deploy under a subpath) come
  // out blank, because /assets does not exist there. './' is also
  // correct for Vercel, which serves from the site root.
  base: './',
  server: {
    port: 5174,
    // Dev-only convenience: VITE_API_URL=/api proxies to the local backend
    // (stripping the /api prefix) so the dashboard works without CORS.
    // The app itself defaults to http://localhost:8001 in dev; this proxy
    // is only used when VITE_API_URL is explicitly set to /api.
    proxy: { '/api': { target: 'http://localhost:8001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } },
  },
})
