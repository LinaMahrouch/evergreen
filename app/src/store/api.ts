// The five requests the app makes to an openGym server, as a paired device (docs/MOBILE.md):
// redeem a pairing code, ask who we are, read the profile, read its revision, write it.
// Auth is a bearer token — no cookie, so this works from the web build on another origin too.
import type { State } from '@/engine'

export type ApiFailure = 'offline' | 'denied' | 'not-opengym' | 'server' | 'bad-code'

export class ApiError extends Error {
  constructor(public kind: ApiFailure, message: string, public status = 0) {
    super(message)
  }
}

export interface RemoteUser { id: string; name: string }

const TIMEOUT_MS = 20_000

/** "gym.example.com" → "https://gym.example.com"; a bare LAN address gets http. */
export function normalizeUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '')
  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) {
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url)
    url = (local ? 'http://' : 'https://') + url
  }
  return url
}

async function call(url: string, init: RequestInit): Promise<{ status: number; body: any }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal })
  } catch {
    throw new ApiError('offline', 'Could not reach the server.')
  } finally {
    clearTimeout(timer)
  }
  let body: any = null
  try { body = await res.json() } catch { /* not JSON */ }
  if (res.status === 401) throw new ApiError('denied', 'The server no longer accepts this device.', 401)
  if (res.status === 409) return { status: 409, body }
  if (!res.ok) throw new ApiError('server', body?.error || `The server answered with an error (HTTP ${res.status}).`, res.status)
  if (body == null) throw new ApiError('not-opengym', 'That address answered, but not as an openGym server.', res.status)
  return { status: res.status, body }
}

const authed = (token: string, json = false): HeadersInit => ({
  Authorization: 'Bearer ' + token,
  ...(json ? { 'Content-Type': 'application/json' } : {}),
})

export async function redeemCode(url: string, code: string): Promise<{ token: string; user: RemoteUser }> {
  let out
  try {
    out = await call(url + '/api/pair/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    })
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'server' && e.status === 400) {
      throw new ApiError('bad-code', 'That code is wrong or has expired. Codes last five minutes and work once.', 400)
    }
    throw e
  }
  if (!out.body?.token) throw new ApiError('not-opengym', 'That address answered, but not as an openGym server.')
  return { token: out.body.token, user: out.body.user }
}

/** Who this token belongs to. Past half its life the server hands a fresh token back too. */
export async function whoAmI(url: string, token: string): Promise<{ user: RemoteUser; token?: string }> {
  const { body } = await call(url + '/api/me', { headers: authed(token) })
  return { user: body.user, token: body.token }
}

export async function getRev(url: string, token: string): Promise<number> {
  const { body } = await call(url + '/api/data/rev', { headers: authed(token) })
  return body.rev || 0
}

export async function getData(url: string, token: string): Promise<{ state: State | null; rev: number }> {
  const { body } = await call(url + '/api/data', { headers: authed(token) })
  return { state: body.state || null, rev: body.rev || 0 }
}

/** A conditional write. `conflict` carries the server's current document to merge with. */
export async function putData(
  url: string, token: string, state: State, baseRev: number,
): Promise<{ ok: true; rev: number } | { ok: false; conflict: { state: State | null; rev: number } }> {
  const { status, body } = await call(url + '/api/data', {
    method: 'PUT',
    headers: authed(token, true),
    body: JSON.stringify({ state, baseRev }),
  })
  if (status === 409) return { ok: false, conflict: { state: body?.state || null, rev: body?.rev || 0 } }
  return { ok: true, rev: body.rev }
}
