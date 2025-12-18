import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8788'
    }
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client')
    }
  }
});
