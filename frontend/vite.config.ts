import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true, // proxy WebSocket upgrades (Socket.io)
        // Ensure Set-Cookie headers from backend are properly passed through
        // and not blocked by domain mismatches during proxying
        cookieDomainRewrite: '',
      },
    },
  },
  build: {
    // Vite emits <link rel="modulepreload"> for all chunks by default — including
    // lazy vendor chunks like pdf-vendor and icons-vendor. This causes browsers to
    // proactively validate all chunks on every page load, which adds 9+ seconds when
    // a Vercel CDN node is slow. Disabled so lazy chunks only fetch when needed.
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'charts-vendor': ['recharts'],
          'maps-vendor': ['leaflet', 'react-leaflet'],
          'excel-vendor': ['xlsx', 'xlsx-js-style', 'papaparse'],
          'pdf-vendor': ['jspdf', 'html2canvas'],
          'socket-vendor': ['socket.io-client'],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
})
