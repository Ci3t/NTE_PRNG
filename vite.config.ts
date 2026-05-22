import { defineConfig } from 'vite'

export default defineConfig({
  base: '/NTE_PRNG_Modules/',
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
