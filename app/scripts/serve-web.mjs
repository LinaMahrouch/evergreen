#!/usr/bin/env node
/* Serves the exported web build (dist/) for a local look, with the single-page fallback a
 * static host needs: any path that is not a file answers with index.html, so reloading on
 * /plan or opening a deep link works.
 *
 *   npm run export:web && npm run serve:web          → http://localhost:8081
 *   PORT=9000 npm run serve:web
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const PORT = Number(process.env.PORT) || 8081
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json'
}

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('No build found. Run `npm run export:web` first.')
  process.exit(1)
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)))
  // Never serve from outside dist/, whatever the path says.
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html')
  const hashed = file.includes(`${path.sep}_expo${path.sep}static${path.sep}`)
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache'
  })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`Evergreen web build on http://localhost:${PORT}`))
