import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@ui': resolve(__dirname, 'src/components/ui'),
      '@shared': resolve(__dirname, 'src/components/shared'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@config': resolve(__dirname, 'src/config'),
    }
  },
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        folder: resolve(__dirname, 'folder.html')
      }
    }
  },
  server: {
    port: 5173,
    headers: {
      // 解决 "Refused to load the image 'safe-file://...' because it violates the following Content Security Policy directive"
      'Content-Security-Policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: safe-file:; font-src 'self';"
    }
  }
})
