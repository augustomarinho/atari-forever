import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: './',
  server: { port: 9000, strictPort: true },
  preview: { port: 9000, strictPort: true },
  build: mode === 'pages'
    ? { rollupOptions: { input: { index: resolve('pages.html') } } }
    : undefined,
}))
