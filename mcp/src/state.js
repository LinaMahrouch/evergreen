/* opengym-mcp state — two ways to reach a profile:
   - file mode (the original): reads ./data/state-<uid>.json + db.json, read-only. Cached with an
     fs.watch + mtime fallback so a session the api server just wrote is visible on the next
     tool call without a restart.
   - remote mode (remote.js): a paired device of a running api. Reads through GET /api/data and
     can also write, through the same conditional PUT every other device uses. Chosen whenever
     a pairing exists (OPENGYM_URL + OPENGYM_TOKEN, or the auth file `npm run pair` writes). */
import fs from 'node:fs'
import path from 'node:path'
import { loadAuth, saveAuth, request, RemoteError } from './remote.js'
import { stampRoutines, stampCustomEx } from '../../frontend/src/lib/sync-merge.js'

const DATA_DIR = process.env.OPENGYM_DATA || path.join(process.cwd(), 'data')

// null = no state file (brand-new account); undefined = not yet loaded.
let _state = undefined
let _db = undefined
let _uid = null
let _watcher = null
let _loadedMtime = 0    // mtimeMs we last read at — used to catch watcher omissions

// Remote mode. `_auth` is undefined until first asked, then the pairing or null.
let _auth = undefined
let _rev = 0
let _remoteUser = null
let _request = request   // swapped by the tests for a fake server
const auth = () => (_auth === undefined ? (_auth = loadAuth()) : _auth)
export const isRemote = () => !!auth()
export const remoteUrl = () => auth()?.url || null

function readJsonOrNull(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

function reloadDb() { _db = readJsonOrNull(path.join(DATA_DIR, 'db.json')) || { users: [], creds: [], subs: [], invites: [] } }

function stateFile(uid) {
  return path.join(DATA_DIR, 'state-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json')
}

// Pick the uid: OPENGYM_UID env, else the only state-* file, else the only user in db.json.
// Throws listing the options if ambiguous. The sanitiser on stateFile() keeps a sneaky
// '..' in OPENGYM_UID harmless.
function resolveUid() {
  const envUid = (process.env.OPENGYM_UID || '').trim()
  if (envUid) {
    if (!/^[a-zA-Z0-9_-]+$/.test(envUid)) throw new Error(`OPENGYM_UID contains characters that aren't safe in a filename: ${JSON.stringify(envUid)}`)
    return envUid
  }
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^state-[a-zA-Z0-9_-]+\.json$/.test(f))
    .map(f => f.replace(/^state-/, '').replace(/\.json$/, ''))
  if (files.length === 1) return files[0]
  if (files.length === 0) {
    reloadDb()
    if (_db.users.length === 1) return _db.users[0].id
    if (_db.users.length === 0) throw new Error(`no openGym users found in ${path.join(DATA_DIR, 'db.json')} — sign in at least once on a device`)
    // Multiple users in db.json but no state files yet — list their ids, not the (empty)
    // files list. Hit when accounts exist but none has signed in on a device.
    throw new Error(
      `multiple openGym users found — set OPENGYM_UID to one of: ${_db.users.map(u => u.id).join(', ')}\n` +
      `  (look them up in ${path.join(DATA_DIR, 'db.json')} under "users"[].id)`
    )
  }
  throw new Error(
    `multiple openGym users found — set OPENGYM_UID to one of: ${files.join(', ')}\n` +
    `  (look them up in ${path.join(DATA_DIR, 'db.json')} under "users"[].id)`
  )
}

// Idempotent. Picks the uid, loads db.json, attaches the watcher, primes state.
export function init() {
  if (_uid !== null) return
  if (isRemote()) return   // nothing on disk to resolve; refresh() does the work
  if (!fs.existsSync(DATA_DIR)) throw new Error(`OPENGYM_DATA dir does not exist: ${DATA_DIR}`)
  _uid = resolveUid()
  reloadDb()
  const file = stateFile(_uid)
  if (fs.existsSync(file)) {
    _state = readJsonOrNull(file)
    if (_state) _state = Object.assign({}, defaultsShape(), _state)
    try { _loadedMtime = fs.statSync(file).mtimeMs } catch {}
  }
  if (_watcher) _watcher.close()
  // fs.watch is best-effort: the api server's atomic write at PUT /api/data is the source of
  // truth, and a stale read just gets corrected on the next change or the next tool call.
  try {
    _watcher = fs.watch(file, () => {
      // On change, simply clear the cache — the next getState() will re-read. Avoids reading
      // twice if the watcher fires multiple events for one atomic-write (rename + create).
      _state = undefined
      _loadedMtime = 0
    })
    // Unref'd, or the watcher alone holds the event loop open and the process outlives the
    // client that spawned it — "exits when the LLM client disconnects" stops being true the
    // moment there is a state file to watch. Most clients kill the child anyway, but one that
    // merely closes the pipe would leak a process per session. Watching is unaffected: the
    // stdio transport is what keeps the loop alive while a client is actually attached.
    _watcher.unref()
  } catch { /* fs.watch unsupported on this platform; tools will re-read on mtime change */ }
}

/**
 * Remote mode: make the cached document current before a tool reads it. One cheap request
 * (the revision number) per tool call, the document itself only when that number moved. A
 * no-op in file mode, where getState() checks the file's mtime instead.
 */
export async function refresh() {
  const a = auth()
  if (!a) return
  if (!_remoteUser) {
    const me = await _request(a, 'GET', '/api/me')
    _remoteUser = me.body.user || null
    // Past half its life the server hands out a fresh token with the answer; keep it, or the
    // pairing dies at SESSION_DAYS however often it is used.
    if (me.body.token && !a.fromEnv) {
      a.token = me.body.token
      try { saveAuth({ ...a, user: _remoteUser }) } catch { /* read-only install: renew again next start */ }
    }
  }
  if (_state !== undefined) {
    const r = await _request(a, 'GET', '/api/data/rev')
    if ((r.body.rev || 0) === _rev) return
  }
  const doc = await _request(a, 'GET', '/api/data')
  _rev = doc.body.rev || 0
  _state = doc.body.state ? Object.assign({}, defaultsShape(), doc.body.state) : null
}

const WRITE_ATTEMPTS = 5

/**
 * Apply `fn` to the profile and save it, as one more device would.
 *
 * `fn` receives a draft of the current document, changes it in place and returns whatever the
 * tool wants to report. Anything it throws aborts before a byte is written. The save is the
 * api's own conditional write: if another device wrote in between, the server answers 409 with
 * the document as it now stands and `fn` simply runs again on top of that one — so a set logged
 * on the phone while the agent was planning is never overwritten.
 *
 * Routines and custom exercises the change touched are stamped the way the app's store stamps
 * them (stampRoutines / stampCustomEx), which is what lets a later merge on a device keep the
 * newer version of each instead of the whole older copy.
 */
export async function mutate(fn) {
  const a = auth()
  if (!a) {
    throw new RemoteError(
      'this openGym MCP server is read-only: it reads the data folder directly and has no pairing to write through. ' +
      'To let it plan routines, pair it with the running server: open openGym in a browser → Settings → "Pair the mobile app", ' +
      'then run `npm run pair -- <server-url> <code>` in the mcp folder and restart the client.',
      'EREADONLY', 0)
  }
  let doc = await _request(a, 'GET', '/api/data')
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const prev = doc.body.state || {}
    const rev = doc.body.rev || 0
    const draft = structuredClone({ routines: [], week: {}, dayPlan: {}, customEx: [], bodyweight: [], workouts: [], ...prev })
    const result = fn(draft)
    const now = Math.max(Date.now(), (Number(prev._ts) || 0) + 1)
    stampRoutines(prev.routines, draft.routines, now)
    stampCustomEx(prev.customEx, draft.customEx, now)
    draft._ts = now
    delete draft._rev          // server-owned
    const put = await _request(a, 'PUT', '/api/data', { state: draft, baseRev: rev })
    if (put.status === 409) { doc = { body: { state: put.body.state, rev: put.body.rev } }; continue }
    _rev = put.body.rev || rev + 1
    _state = Object.assign({}, defaultsShape(), draft, { _rev })
    return { result, rev: _rev, attempts: attempt + 1 }
  }
  throw new RemoteError('the profile kept changing on another device while saving — nothing was written, try again', 'ECONFLICT', 409)
}

// Returns the state object, or null for a fresh account that never signed in on a device.
export function getState() {
  if (isRemote()) return _state === undefined ? null : _state
  init()
  const file = stateFile(_uid)
  // Re-read if the file's mtime changed since our last load — covers watcher omissions and
  // platforms with no fs.watch.
  let mtime
  try { mtime = fs.statSync(file).mtimeMs } catch {
    return _state === undefined ? null : _state
  }
  if (_state === undefined || mtime !== _loadedMtime) {
    const fresh = readJsonOrNull(file)
    if (fresh) {
      // Same shape the frontend builds on pullState — defaults merged with stored state so any
      // field the app added since the snapshot was last saved shows up undefined-safe.
      _state = Object.assign({}, defaultsShape(), fresh)
      _loadedMtime = mtime
    } else if (_state === undefined) {
      _state = null  // no state file at all — never signed in on a device
    }
  }
  return _state
}

// Returns the user record (id + name). No passkey material, no VAPID keys, no push subs.
export function getUser() {
  if (isRemote()) return { id: _remoteUser?.id || 'remote', name: _remoteUser?.name || auth().user?.name || 'Profile', created: null }
  init()
  const u = _db.users.find(x => x.id === _uid) || { id: _uid, name: 'Profile', created: null }
  return { id: u.id, name: u.name, created: u.created || null }
}

export const dataDir = () => DATA_DIR

// Test-only: a fake paired server. `requestFn(auth, method, route, body)` stands in for remote.js.
export function _seedRemoteForTests(requestFn) {
  _auth = requestFn ? { url: 'http://test.invalid', token: 't', user: null, fromEnv: true } : null
  _request = requestFn || request
  _state = undefined
  _rev = 0
  _remoteUser = null
}

// Test-only: work against a passed-in state, not the disk.
export function _seedStateForTests(state) {
  _auth = null
  _uid = 'test-uid'
  _db = { users: [{ id: _uid, name: 'Test', created: '2026-07-26T00:00:00.000Z' }], creds: [], subs: [], invites: [] }
  _state = state
  _loadedMtime = Number.MAX_SAFE_INTEGER   // never re-read from disk in a test
  if (_watcher) { _watcher.close(); _watcher = null }
}

function defaultsShape() {
  return {
    unit: 'kg', restSec: 90, sound: true, lang: 'en',
    theme: 'dark', accent: 'lime', body: 'male', targetW: null,
    bodyweight: [], routines: [], week: {}, dayPlan: {},
    exWeights: {}, workouts: [], customEx: [], gifSize: 'full',
    reminder: { on: false, time: '08:00', tz: null }
  }
}
