import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/
  base: './',
  test: {
    environment: 'node',
  },
})
