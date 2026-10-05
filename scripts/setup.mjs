#!/usr/bin/env node
/* One-time setup for running without Docker:
 *
 *   npm run setup
 *
 * Installs the dependencies of the four packages (api, mcp, frontend, app), builds openGym's
 * web app into frontend/dist and exports the Evergreen web app into app/dist. After it,
 * `npm run server` starts everything.
 *
 * Safe to run again: it only reinstalls what is missing, and rebuilds both web apps.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(label, cmd, args, cwd, env = {}) {
  console.log(`\n── ${label}`)
  const out = spawnSync(cmd, args, { cwd: path.join(ROOT, cwd), stdio: 'inherit', env: { ...process.env, ...env }, shell: process.platform === 'win32' })
  if (out.status !== 0) { console.error(`\n${label} failed (exit ${out.status}).`); process.exit(out.status || 1) }
}

const installed = dir => fs.existsSync(path.join(ROOT, dir, 'node_modules'))

if (!installed('api')) run('api: install', npm, ['ci', '--omit=dev', '--omit=optional'], 'api')
if (!installed('mcp')) run('mcp: install', npm, ['ci'], 'mcp')
if (!installed('frontend')) run('openGym web app: install', npm, ['ci'], 'frontend')
if (!installed('app')) run('Evergreen app: install', npm, ['ci'], 'app')

// The exercise pictures are not in this repository (NOTICE.md). Docker downloads them into
// ./media on first start; without Docker the web app loads them from the same public CDN
// openGym's own phone build uses, unless ./media has been filled by scripts/fetch-media.sh.
const CDN = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
const haveMedia = fs.existsSync(path.join(ROOT, 'media', 'img')) && fs.readdirSync(path.join(ROOT, 'media', 'img')).length > 0
run('openGym web app: build', npx, ['vite', 'build'], 'frontend',
  haveMedia ? {} : { VITE_IMG_BASE: `${CDN}/images/`, VITE_GIF_BASE: `${CDN}/videos/` })

run('Evergreen app: copy the training engine', npm, ['run', 'sync:engine'], 'app')
run('Evergreen app: export for the web', npx, ['expo', 'export', '--platform', 'web'], 'app')

if (!fs.existsSync(path.join(ROOT, '.env'))) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env'))
  console.log('\nCreated .env from .env.example (localhost, port 8080).')
}

console.log('\nDone. Start everything with:  npm run server\n')
