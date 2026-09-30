import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy visualisation libraries out of the app bundle so
        // they can be cached independently.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy API calls so the browser never hits CORS during development.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
