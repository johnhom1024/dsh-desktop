import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(rootDir, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src/renderer'),
    },
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/dist/**', '**/release/**'],
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
  },
  build: {
    outDir: resolve(rootDir, 'dist/renderer'),
    emptyOutDir: true,
  },
  test: {
    root: rootDir,
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
    setupFiles: ['src/renderer/test-setup.ts'],
  },
})
