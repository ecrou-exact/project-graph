import { defineConfig } from 'vite'
import { docsPlugin } from './scripts/docs.mjs'
import { hugoExamplePlugin } from './scripts/hugo.mjs'

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/
  base: './',
  // Several pages (the app, docs/, hugo-example/), no single-page fallback: an
  // unknown address is a 404, as on GitHub Pages, never the app at a wrong
  // depth (its relative links would pile up: docs/docs/…).
  appType: 'mpa',
  // Documentation site: docs/index.html, llms.txt, llms-full.txt (scripts/docs.mjs);
  // the Hugo example site at /hugo-example/ (scripts/hugo.mjs).
  plugins: [docsPlugin(), hugoExamplePlugin()],
  test: {
    environment: 'node',
  },
})
