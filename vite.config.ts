import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // The custom backend (server/index.js) during development.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
