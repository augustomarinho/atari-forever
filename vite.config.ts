import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { port: 9000, strictPort: true },
  preview: { port: 9000, strictPort: true },
})
