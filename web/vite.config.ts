import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  build: {
    // The Go binary embeds web/dist (see web/embed.go). Vite owns and empties
    // only this subdirectory, so the committed placeholder that keeps
    // go:embed compiling before the first build survives.
    outDir: 'dist/site',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
