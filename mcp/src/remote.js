/* opengym-mcp remote mode — talks to a running openGym api over HTTP as a paired device.
 *
 * The file mode in state.js can only read: the api is the one writer of a state file, and its
 * compare-and-write on `_rev` is only atomic inside its own process. A second process writing
 * the file could drop a set the phone logged a moment earlier, and leave two different documents
 * under one revision number. So every write here goes through PUT /api/data with `baseRev`,
 * exactly like the web app and the phone: a stale write is refused with 409 and the current
 * document, the change is applied again on top of it, and nothing is lost.
 *
 * Auth is the pairing the mobile app already uses (docs/MOBILE.md): Settings → "Pair the mobile
 * app" shows a one-time code, `npm run pair -- <url> <code>` redeems it for a bearer token and
 * keeps it in an auth file beside this package. No new server route, no new credential type.
 * The token renews itself through GET /api/me once it is past half its life.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const AUTH_FILE = process.env.OPENGYM_AUTH_FILE || path.join(HERE, '..', '.auth.json')
const TIMEOUT_MS = 20_000

const trimBase = url => String(url || '').trim().replace(/\/+$/, '')

/** { url, token, user } from the environment or the auth file, or null when neither is set. */
export function loadAuth() {
  const envUrl = trimBase(process.env.OPENGYM_URL)
  const envToken = (process.env.OPENGYM_TOKEN || '').trim()
  if (envUrl && envToken) return { url: envUrl, token: envToken, user: null, fromEnv: true }
  try {
    const saved = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    if (saved && saved.url && saved.token) {
      // OPENGYM_URL alone repoints a saved pairing (a tunnel whose address changed).
      return { url: envUrl || trimBase(saved.url), token: saved.token, user: saved.user || null, fromEnv: false }
    }
  } catch { /* no auth file — not paired */ }
  return null
}

export function saveAuth(auth) {
  const body = JSON.stringify({ url: auth.url, token: auth.token, user: auth.user || null, saved: new Date().toISOString() }, null, 2)
  fs.writeFileSync(AUTH_FILE, body, { mode: 0o600 })
}

export class RemoteError extends Error {
  constructor(message, code, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** One request against the paired server. Returns { status, body } for 2xx and 409 alike. */
export async function request(auth, method, route, body) {
  let res
  try {
    res = await fetch(auth.url + route, {
      method,
      headers: {
        Authorization: 'Bearer ' + auth.token,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (e) {
    throw new RemoteError(`could not reach the openGym server at ${auth.url} (${e.cause?.code || e.name})`, 'EUNREACHABLE', 0)
  }
  let data = null
  try { data = await res.json() } catch { /* not JSON: a proxy's page, handled below */ }
  if (res.status === 401) {
    throw new RemoteError('the openGym server no longer accepts this pairing — pair again with `npm run pair -- <url> <code>`', 'EAUTH', 401)
  }
  if (!res.ok && res.status !== 409) {
    throw new RemoteError(`openGym server answered HTTP ${res.status}${data?.error ? ': ' + data.error : ''}`, 'EHTTP', res.status)
  }
  if (data === null) {
    throw new RemoteError(`${auth.url} answered with something other than the openGym api — check the address`, 'ENOTAPI', res.status)
  }
  return { status: res.status, body: data }
}

/** Redeems a one-time pairing code for a bearer token. */
export async function redeem(url, code) {
  const base = trimBase(url)
  let res
  try {
    res = await fetch(base + '/api/pair/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || '').trim() }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (e) {
    throw new RemoteError(`could not reach ${base} (${e.cause?.code || e.name})`, 'EUNREACHABLE', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.token) {
    throw new RemoteError(data?.error || `pairing failed (HTTP ${res.status})`, 'EPAIR', res.status)
  }
  return { url: base, token: data.token, user: data.user || null }
}
