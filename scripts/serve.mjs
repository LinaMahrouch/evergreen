#!/usr/bin/env node
/* Runs the whole stack without Docker, on plain Node:
 *
 *   npm run server
 *
 *   :8080  openGym's own web app + /api      (what docker-compose's `web` container does)
 *   :8081  the Evergreen web app             (app/dist, when it has been exported)
 *   :3000  the api itself, loopback only
 *
 * This is the stand-in for web/nginx.conf.template on a machine with no Docker: same single
 * origin for the app and /api (passkeys need that), same proxy headers, same security headers.
 * It is meant for running on your own computer or a small server behind a real reverse proxy —
 * `docker compose up` remains the supported way to deploy (docs/SELF_HOSTING.md).
 *
 * Settings come from .env in the repo root, the same file docker-compose reads.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// The same KEY=value file docker-compose reads. Real environment variables win.
function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m || m[1] in process.env) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
loadEnv(path.join(ROOT, '.env'))

const WEB_PORT = Number(process.env.WEB_PORT) || 8080
const APP_PORT = Number(process.env.APP_PORT) || 8081
const API_PORT = Number(process.env.PORT) || 3000
const ORIGIN = process.env.ORIGIN || `http://localhost:${WEB_PORT}`
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data')
const WEB_DIST = path.join(ROOT, 'frontend', 'dist')
const APP_DIST = path.join(ROOT, 'app', 'dist')
const MEDIA = path.join(ROOT, 'media')
const UPLOAD_LIMIT = 5 * 1024 * 1024        // nginx: client_max_body_size 5m on /api/

const fail = msg => { console.error('\n' + msg + '\n'); process.exit(1) }
if (!fs.existsSync(path.join(ROOT, 'api', 'node_modules'))) fail('The api has no dependencies installed yet. Run `npm run setup` first.')
if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) fail('openGym\'s web app has not been built yet. Run `npm run setup` first.')

/* ---------- the api, as a child process ---------- */

fs.mkdirSync(DATA_DIR, { recursive: true })
const api = spawn(process.execPath, ['server.js'], {
  cwd: path.join(ROOT, 'api'),
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(API_PORT),
    // Loopback only: everything reaches the api through the proxy below.
    HOST: '127.0.0.1',
    DATA_DIR,
    ORIGIN,
    RP_ID: process.env.RP_ID || new URL(ORIGIN).hostname,
    // The proxy below is the only thing between a browser and the api, and it sets
    // X-Forwarded-For itself, so the api may believe it (rate limits are per client address).
    TRUST_PROXY: process.env.TRUST_PROXY || '1',
    NODE_ENV: process.env.NODE_ENV || 'production'
  }
})
api.on('exit', code => { console.error(`[serve] the api stopped (exit ${code})`); process.exit(code || 1) })
const stop = () => { api.kill(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

/* ---------- static files ---------- */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json'
}
const SECURITY = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "frame-ancestors 'none'"
}
const IMMUTABLE = /\.(png|jpe?g|gif|ico|svg|woff2?|webp|avif|ttf)$/i

// `base` joined with the request path, or null when the path climbs out of `base`.
function resolveIn(base, urlPath) {
  let rel
  try { rel = decodeURIComponent(urlPath) } catch { return null }
  const file = path.normalize(path.join(base, rel))
  return file === base || file.startsWith(base + path.sep) ? file : null
}

function sendFile(res, file, { hashed = false } = {}) {
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    ...SECURITY,
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': hashed || IMMUTABLE.test(ext) ? 'public, max-age=2592000, immutable' : 'no-cache, must-revalidate'
  })
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res)
}

const isFile = file => { try { return fs.statSync(file).isFile() } catch { return false } }

/** Serves `dist` as a single-page app: a path that is not a file answers with index.html. */
function staticSite(dist, { hashedDir } = {}) {
  return (req, res, pathname) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY); return res.end() }
    const file = resolveIn(dist, pathname)
    if (!file) { res.writeHead(403, SECURITY); return res.end() }
    if (isFile(file)) return sendFile(res, file, { hashed: !!hashedDir && file.includes(hashedDir) })
    sendFile(res, path.join(dist, 'index.html'))
  }
}

/* ---------- /api → the api ---------- */

function proxyApi(req, res, target) {
  const client = req.socket.remoteAddress || ''
  // Uploads to /api/media/ have their own, larger limit, enforced by the api itself.
  const limited = !target.startsWith('/api/media/')
  if (limited && Number(req.headers['content-length']) > UPLOAD_LIMIT) { res.writeHead(413, SECURITY); return res.end() }
  const headers = { ...req.headers, 'x-real-ip': client, 'x-forwarded-for': client, 'x-forwarded-proto': 'http' }
  // Never pass through what a client claims about itself.
  delete headers['cf-connecting-ip']
  // `target` is the path as the URL parser normalised it, never the raw request line.
  const upstream = http.request({ host: '127.0.0.1', port: API_PORT, method: req.method, path: target, headers }, up => {
    res.writeHead(up.statusCode || 502, up.headers)
    up.pipe(res)
  })
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { ...SECURITY, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'the api is not answering' }))
  })
  let seen = 0
  req.on('data', chunk => {
    seen += chunk.length
    if (limited && seen > UPLOAD_LIMIT) { upstream.destroy(); req.destroy() }
  })
  req.pipe(upstream)
}

/* ---------- the two sites ---------- */

const webSite = staticSite(WEB_DIST, { hashedDir: path.sep + 'assets' + path.sep })

http.createServer((req, res) => {
  let pathname, search
  try { ({ pathname, search } = new URL(req.url, 'http://x')) } catch { res.writeHead(400, SECURITY); return res.end() }
  if (pathname.startsWith('/api/')) return proxyApi(req, res, pathname + search)
  // Exercise media, when it has been downloaded into ./media (scripts/fetch-media.sh). A build
  // made by `npm run setup` loads it from the CDN instead and never asks for these.
  for (const kind of ['img', 'gif']) {
    if (pathname.startsWith(`/${kind}/`)) {
      const file = resolveIn(path.join(MEDIA, kind), pathname.slice(kind.length + 1))
      if (file && isFile(file)) return sendFile(res, file)
      res.writeHead(404, SECURITY)
      return res.end()
    }
  }
  webSite(req, res, pathname)
}).listen(WEB_PORT, () => {
  console.log(`\n  openGym web + api   ${ORIGIN}`)
  console.log(`  data folder         ${DATA_DIR}   (back this up)`)
})

if (fs.existsSync(path.join(APP_DIST, 'index.html'))) {
  const appSite = staticSite(APP_DIST, { hashedDir: path.sep + '_expo' + path.sep })
  http.createServer((req, res) => {
    let pathname
    try { pathname = new URL(req.url, 'http://x').pathname } catch { res.writeHead(400, SECURITY); return res.end() }
    appSite(req, res, pathname)
  }).listen(APP_PORT, () => console.log(`  Evergreen web app   http://localhost:${APP_PORT}\n`))
} else {
  console.log('  (Evergreen web app not exported yet — `npm run setup` builds it)\n')
}
