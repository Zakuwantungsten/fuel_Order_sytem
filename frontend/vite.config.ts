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
})
