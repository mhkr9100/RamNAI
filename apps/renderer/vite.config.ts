import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@workspace/shared': path.resolve(__dirname, '../../packages/shared/src')
    }
  },
  server: {
    port: 5180,
    strictPort: true,
    host: '127.0.0.1'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'framer-motion', 'lucide-react', 'zustand'],
          markdown: ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js']
        }
      }
    }
  }
});
