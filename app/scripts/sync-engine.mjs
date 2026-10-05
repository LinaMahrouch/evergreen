#!/usr/bin/env node
/* Copies openGym's training logic into the app.
 *
 *   npm run sync:engine
 *
 * The app does not re-implement what decides your next weight, how a finished session is
 * saved, or how two devices' copies are merged: it runs the same pure modules openGym's own
 * web app runs (../frontend/src/lib). That is what keeps the two byte-compatible — a workout
 * logged here opens correctly there, and the other way round.
 *
 * They are copied rather than imported across the repo so the app folder stands on its own
 * (store builds, Metro, type-checking), and so the two lines that only make sense under
 * Vite/Node can be adjusted on the way in. Starting from ENTRY, every module they import is
 * followed and copied too; a module that reaches outside lib/ (into React components, say)
 * stops the script, because it would not run here.
 *
 * Never edit src/engine/lib by hand — change openGym's source and run this again.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '../../frontend/src/lib')
const OUT = path.resolve(HERE, '../src/engine/lib')

// What the app calls directly (see src/engine/index.js). Their imports come along by themselves.
const ENTRY = [
  'exercises.js', 'history.js', 'format.js', 'workout-model.js',
  'session-start.js', 'session-merge.js', 'finish-workout.js',
  'progression.js', 'onerm.js', 'muscles.js',
  'sync-merge.js', 'starter.js', 'routines.js', 'units.js', 'plan-apply.js'
]

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

// What has to change for Metro + Hermes. Each is checked to have matched, so an upstream edit
// that moves one of these lines fails loudly here instead of at app start.
const PATCHES = {
  'exercises.js': [
    // `import.meta` does not parse in Hermes. The two Vite variables it read only point the
    // exercise media somewhere else; the app sets its own base (src/engine/index.js).
    [`const ENV = import.meta.env || {}`, `const ENV = {}`]
  ],
  'routines.js': [
    // Hermes has no `structuredClone`. A routine is plain JSON, so this copies the same thing.
    [`structuredClone(routine)`, `JSON.parse(JSON.stringify(routine))`]
  ]
}
// Metro loads .json natively and does not parse import attributes.
const stripJsonAttr = code => code.replace(/\s+with\s*\{\s*type:\s*'json'\s*\}/g, '')

const HEADER = file =>
  `// VENDORED from openGym (frontend/src/lib/${file}) — AGPL-3.0-or-later, © Duarte Santos.\n` +
  `// Do not edit here: change the source and run \`npm run sync:engine\`.\n`

const seen = new Set()
const queue = [...ENTRY]
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

let bytes = 0
while (queue.length) {
  const file = queue.shift()
  if (seen.has(file)) continue
  seen.add(file)
  const from = path.join(SRC, file)
  if (!fs.existsSync(from)) throw new Error(`${file} is imported but does not exist in ${SRC}`)

  if (file.endsWith('.json')) {
    fs.copyFileSync(from, path.join(OUT, file))
    bytes += fs.statSync(from).size
    continue
  }

  let code = fs.readFileSync(from, 'utf8')
  for (const m of code.matchAll(IMPORT)) {
    const spec = m[1] || m[2]
    if (!spec.startsWith('.')) throw new Error(`${file} imports the package "${spec}" — the engine must stay dependency-free`)
    if (!/^\.\/[\w.-]+\.(js|json)$/.test(spec)) {
      throw new Error(`${file} imports "${spec}", which is outside lib/ — it cannot run in the app. Keep it out of ENTRY or split the module upstream.`)
    }
    queue.push(spec.slice(2))
  }
  for (const [find, replace] of PATCHES[file] || []) {
    if (!code.includes(find)) throw new Error(`${file}: expected to find \`${find}\` — the source changed, update PATCHES`)
    code = code.replace(find, replace)
  }
  code = stripJsonAttr(code)
  if (/\bimport\.meta\b/.test(code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    throw new Error(`${file} still uses import.meta outside a comment — add a patch for it`)
  }
  fs.writeFileSync(path.join(OUT, file), HEADER(file) + code)
  bytes += code.length
}

console.log(`engine: ${seen.size} modules, ${(bytes / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), OUT)}`)
console.log([...seen].sort().join(' '))
