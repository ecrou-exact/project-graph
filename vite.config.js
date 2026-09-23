import { defineConfig } from 'vite'
import { docsPlugin } from './scripts/docs.mjs'

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/
  base: './',
  // Documentation site: docs/index.html, llms.txt, llms-full.txt (scripts/docs.mjs).
  plugins: [docsPlugin()],
  test: {
    environment: 'node',
  },
})
