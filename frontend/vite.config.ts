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
        // Ensure Set-Cookie headers from backend are properly passed through
        // and not blocked by domain mismatches during proxying
        cookieDomainRewrite: '',
      },
    },
  },
  build: {
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
