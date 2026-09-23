// The Hugo example site (hugo/example), built with the app so the guide's
// links to /hugo-example/ work everywhere:
//   npm run dev     built into a temporary folder, served at /hugo-example/,
//                   rebuilt when hugo/ changes; the graphs use this dev server's app
//   npm run build   built into dist/hugo-example/, the graphs use the published app
// Needs the `hugo` binary (on PATH, or HUGO=/path/to/hugo). Without it the
// app still builds, and /hugo-example/ explains how to get Hugo.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { SITE } from './docs.mjs'

const root = new URL('..', import.meta.url).pathname
const source = join(root, 'hugo/example')
const hugo = process.env.HUGO || 'hugo'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml',
}

function hasHugo() {
  try {
    execFileSync(hugo, ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Builds the example into `out`; returns an error message, or null. */
function build(out, baseURL, app) {
  try {
    execFileSync(hugo, ['-s', source, '-d', out, '--cleanDestinationDir', '--minify', '--quiet', '--baseURL', baseURL], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HUGO_PARAMS_PIVOGRAPH_APP: app },
    })
    return null
  } catch (error) {
    return String(error.stderr || error.message).trim()
  }
}

const MISSING = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Hugo example</title>
<body style="font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem">
<h1>The Hugo example needs Hugo</h1>
<p>This page is the example site of the Pivograph Hugo component, built with <a href="https://gohugo.io">Hugo</a> 0.130 or later.
Install Hugo from its <a href="https://github.com/gohugoio/hugo/releases">releases</a> (or set <code>HUGO=/path/to/hugo</code>) and restart <code>npm run dev</code>.</p>
<p>It is also online: <a href="${SITE}hugo-example/projects/">${SITE}hugo-example/projects/</a>.</p></body></html>`

export function hugoExamplePlugin() {
  let outDir = 'dist'
  let building = false
  return {
    name: 'pivograph-hugo-example',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
      // Only `vite build`: Vitest loads this config too, and closes it like a build.
      building = config.command === 'build' && !process.env.VITEST
    },
    configureServer(server) {
      const available = hasHugo()
      const out = mkdtempSync(join(tmpdir(), 'pivograph-hugo-example-'))
      let error = null
      let port = server.config.server.port ?? 5173
      const rebuild = () => {
        const origin = `http://localhost:${port}`
        error = available ? build(out, `${origin}/hugo-example/`, `${origin}/`) : null
        if (error) server.config.logger.error(`[hugo-example] ${error}`)
      }
      // Built right away (a restarted server never emits "listening"), and again
      // if the server ends up on another port than the configured one.
      rebuild()
      server.httpServer?.once('listening', () => {
        const actual = server.httpServer.address()?.port
        if (actual && actual !== port) {
          port = actual
          rebuild()
        }
      })
      if (available) {
        // Any change under hugo/ (added, changed or removed files), in bursts:
        // one rebuild once a script has finished writing its pages.
        let timer = null
        server.watcher.add(join(root, 'hugo'))
        server.watcher.on('all', (_event, file) => {
          if (!file.startsWith(join(root, 'hugo'))) return
          clearTimeout(timer)
          timer = setTimeout(rebuild, 300)
        })
      }

      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(req.url.split('?')[0])
        if (path !== '/hugo-example' && !path.startsWith('/hugo-example/')) return next()
        if (path === '/hugo-example') {
          res.statusCode = 301
          res.setHeader('Location', '/hugo-example/')
          return res.end()
        }
        if (!available || error) {
          res.statusCode = available ? 500 : 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          return res.end(available ? `<pre>${error.replace(/</g, '&lt;')}</pre>` : MISSING)
        }
        let file = normalize(join(out, path.slice('/hugo-example/'.length)))
        if (!file.startsWith(out)) return next()
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
        if (!existsSync(file)) {
          res.statusCode = 404
          return res.end('Not found')
        }
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    closeBundle() {
      if (!building) return
      if (!hasHugo()) {
        this.warn('hugo not found: dist/hugo-example/ is not built (see scripts/hugo.mjs)')
        return
      }
      const error = build(join(outDir, 'hugo-example'), `${SITE}hugo-example/`, SITE)
      if (error) this.error(`Hugo example: ${error}`)
    },
  }
}
