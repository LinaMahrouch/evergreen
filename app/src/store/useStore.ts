// The app's state: one profile document (`S`), the session in progress (`active`), and the
// connection to a server if there is one.
//
// `S` is an openGym state document, kept whole — including fields this app never shows (a
// theme, a language, plate inventories set in openGym's own web app). It is read from a server
// and written back as it came, so pairing this app with an existing profile loses nothing.
//
// `active` lives beside it rather than inside it: it changes on every keystroke of a workout
// and never leaves the device (the server drops it from a write anyway), so it has no business
// being cloned and stamped along with years of history each time a rep count changes.
import { create } from 'zustand'
import {
  beatsWeight, bestWeightFor, bestWeightForEntry, betterWeight, buildCombinedEntries,
  buildCompletedWorkout, deriveSessionName, isWarmupRow, mergeStates, registerCustom,
  stampCustomEx, stampRoutines, todayISO, uid, workoutVolume,
  type Active, type State, type Workout,
} from '@/engine'
import { ApiError, getData, getRev, normalizeUrl, putData, redeemCode, whoAmI, type RemoteUser } from './api'
import { KEYS, readJson, readToken, writeJson, writeToken } from './storage'

export type SyncStatus = 'local' | 'ok' | 'syncing' | 'offline' | 'denied' | 'error'
export interface Remote { url: string; user: RemoteUser }
interface Meta {
  /** the server revision this copy was last read from or written as */
  baseRev: number
  /** this device holds changes the server has not got yet */
  dirty: boolean
}

export const DEF: State = {
  unit: 'kg', restSec: 90,
  routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], customEx: [], bodyweight: [],
  targetW: null, active: null, weekStart: 1,
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const arr = (v: unknown) => (Array.isArray(v) ? v : [])
const map = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** Any stored or received document, made safe to read: defaults under it, lists where lists go. */
export function overlay(doc: Partial<State> | null | undefined): State {
  const s = { ...clone(DEF), ...(doc || {}) } as State
  s.routines = arr(s.routines).filter(r => r && r.id != null).map(r => ({ ...r, ex: arr(r.ex) }))
  s.workouts = arr(s.workouts).filter(w => w && w.d)
  s.bodyweight = arr(s.bodyweight).filter(b => b && b.d)
  s.customEx = arr(s.customEx)
  s.week = map(s.week) as State['week']
  s.dayPlan = map(s.dayPlan) as State['dayPlan']
  s.exWeights = map(s.exWeights) as State['exWeights']
  s.unit = s.unit === 'lb' ? 'lb' : 'kg'
  s.restSec = Number(s.restSec) > 0 ? Number(s.restSec) : 90
  s.active = null
  delete s._rev
  return s
}

const hasData = (s: State) => s.routines.length > 0 || s.workouts.length > 0 || s.bodyweight.length > 0

interface Store {
  S: State
  active: Active | null
  ready: boolean
  remote: Remote | null
  status: SyncStatus
  lastSync: number | null
  syncError: string | null

  boot(): Promise<void>
  /** Change the profile: `mut` edits a draft in place. Saved, stamped and synced from here. */
  update(mut: (s: State) => void): void
  /** Swap the whole profile for another (a backup being restored). */
  replace(next: Partial<State>): void

  startWorkout(routineIds: string[]): void
  editActive(mut: (a: Active) => void): void
  /** Saves the session. null when nothing was logged, in which case it is just dropped. */
  finishWorkout(): { workout: Workout; prs: string[] } | null
  discardWorkout(): void

  pair(url: string, code: string): Promise<void>
  unpair(): Promise<void>
  sync(): Promise<void>
}

let token: string | null = null
let meta: Meta = { baseRev: 0, dirty: false }
let saveTimer: ReturnType<typeof setTimeout> | null = null
let activeTimer: ReturnType<typeof setTimeout> | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
// One sync at a time: a pull and a push racing each other is how a copy gets written over the
// revision it has not seen.
let chain: Promise<void> = Promise.resolve()

export const useStore = create<Store>((set, get) => {
  const saveMeta = () => { void writeJson(KEYS.meta, meta) }

  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    // The marker first and at once: if the app dies before the copy below is written, the next
    // start still knows there was something to send, which costs one merge. The other order
    // could lose the change.
    saveMeta()
    saveTimer = setTimeout(() => { saveTimer = null; void writeJson(KEYS.state, get().S) }, 400)
  }

  const persistActive = () => {
    if (activeTimer) clearTimeout(activeTimer)
    activeTimer = setTimeout(() => { activeTimer = null; void writeJson(KEYS.active, get().active) }, 250)
  }

  const schedulePush = () => {
    if (!get().remote) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(() => { pushTimer = null; void get().sync() }, 1500)
  }

  const adopt = (next: State) => {
    registerCustom(next.customEx)
    set({ S: next })
    persist()
  }

  /** Take the server's document: as it is when this device has nothing unsent, merged otherwise. */
  const takeRemote = (doc: { state: State | null; rev: number }) => {
    meta.baseRev = doc.rev
    if (!doc.state) { meta.dirty = hasData(get().S); return }
    adopt(overlay(meta.dirty ? mergeStates(get().S, doc.state) : doc.state))
  }

  const syncOnce = async () => {
    const { remote } = get()
    if (!remote || !token) return
    set({ status: 'syncing' })
    try {
      const rev = await getRev(remote.url, token)
      if (rev !== meta.baseRev) takeRemote(await getData(remote.url, token))
      for (let attempt = 0; attempt < 4 && meta.dirty; attempt++) {
        const sending = get().S
        const res = await putData(remote.url, token, sending, meta.baseRev)
        if (res.ok) {
          meta.baseRev = res.rev
          // Something changed while the write was on its way: that still has to go.
          if (get().S === sending) meta.dirty = false
        } else {
          meta.dirty = true
          takeRemote(res.conflict)
        }
      }
      saveMeta()
      set({ status: 'ok', lastSync: Date.now(), syncError: null })
      if (meta.dirty) schedulePush()
    } catch (e) {
      saveMeta()
      const kind = e instanceof ApiError ? e.kind : 'server'
      set({
        status: kind === 'offline' ? 'offline' : kind === 'denied' ? 'denied' : 'error',
        syncError: e instanceof Error ? e.message : 'Sync failed.',
      })
    }
  }

  return {
    S: clone(DEF),
    active: null,
    ready: false,
    remote: null,
    status: 'local',
    lastSync: null,
    syncError: null,

    async boot() {
      if (get().ready) return
      const [state, active, savedMeta, remote, savedToken] = await Promise.all([
        readJson<State>(KEYS.state),
        readJson<Active>(KEYS.active),
        readJson<Meta>(KEYS.meta),
        readJson<Remote>(KEYS.remote),
        readToken(),
      ])
      const S = overlay(state)
      registerCustom(S.customEx)
      if (savedMeta) meta = { baseRev: Number(savedMeta.baseRev) || 0, dirty: !!savedMeta.dirty }
      token = savedToken
      const paired = remote && token ? remote : null
      set({ S, active: active && Array.isArray(active.entries) ? active : null, remote: paired, status: paired ? 'ok' : 'local', ready: true })
      if (!paired || !token) return
      // A token past half its life comes back renewed; keep it, or the pairing runs out.
      whoAmI(paired.url, token)
        .then(me => { if (me.token) { token = me.token; void writeToken(me.token) } })
        .catch(() => { /* sync below reports what is wrong */ })
      void get().sync()
    },

    update(mut) {
      const prev = get().S
      const S = clone(prev)
      mut(S)
      const now = Math.max(Date.now(), (Number(prev._ts) || 0) + 1)
      stampRoutines(prev.routines, S.routines, now)
      stampCustomEx(prev.customEx, S.customEx, now)
      S._ts = now
      meta.dirty = true
      adopt(S)
      schedulePush()
    },

    replace(next) {
      const S = overlay(next)
      S._ts = Math.max(Date.now(), (Number(get().S._ts) || 0) + 1)
      meta.dirty = true
      adopt(S)
      schedulePush()
    },

    startWorkout(routineIds) {
      const S = get().S
      const built = buildCombinedEntries(S, routineIds)
      const today = todayISO()
      const weighedToday = S.bodyweight.find(b => b.d === today)
      const active: Active = {
        id: uid(),
        d: today,
        start: Date.now(),
        routineIds: built.routineIds,
        name: built.routines.length ? deriveSessionName(built.routines.map(r => r.name)) || 'Workout' : 'Freestyle',
        bw: weighedToday ? weighedToday.w : null,
        cur: 0,
        entries: built.entries,
      }
      set({ active })
      persistActive()
    },

    editActive(mut) {
      const cur = get().active
      if (!cur) return
      const active = clone(cur)
      mut(active)
      set({ active })
      persistActive()
    },

    finishWorkout() {
      const { active, S } = get()
      if (!active) return null
      // A record is a load that beats the best one in the history before this session. The first
      // time an exercise is ever logged there is nothing to beat, so it sets a baseline, not a record.
      const prs: string[] = []
      for (const e of active.entries) {
        const loads = e.sets.filter(s => s.done && !isWarmupRow(s)).map(s => Number(s.w) || 0).filter(w => w > 0)
        if (!loads.length) continue
        const top = loads.reduce((a, b) => betterWeight(e.id, a, b))
        const before = bestWeightFor(S, e.id)
        if (before > 0 && beatsWeight(e.id, top, before)) prs.push(e.id)
      }
      const workout = buildCompletedWorkout(active, { end: Date.now(), prs })
      set({ active: null })
      persistActive()
      if (!workout.entries.length) return null
      workout.vol = workoutVolume(workout)
      get().update(s => {
        for (const e of workout.entries) {
          const top = bestWeightForEntry(e)
          if (top > 0 && beatsWeight(e.id, top, s.exWeights[e.id]?.w || 0)) s.exWeights[e.id] = { w: top, d: workout.d }
        }
        s.workouts.push(workout)
      })
      return { workout, prs }
    },

    discardWorkout() {
      set({ active: null })
      persistActive()
    },

    async pair(rawUrl, code) {
      const url = normalizeUrl(rawUrl)
      if (!url) throw new ApiError('offline', 'Enter the address of your server.')
      const redeemed = await redeemCode(url, code)
      const doc = await getData(url, redeemed.token)
      token = redeemed.token
      const remote: Remote = { url, user: redeemed.user }
      await Promise.all([writeToken(token), writeJson(KEYS.remote, remote)])
      const local = get().S
      const mine = hasData(local)
      // The account's own profile decides its settings and plan; this device adds what it
      // logged on its own (mergeStates `prefer`). A profile with nothing yet takes this copy.
      const next = doc.state ? overlay(mergeStates(doc.state, mine ? local : null, { prefer: 'a' })) : local
      meta = { baseRev: doc.rev, dirty: doc.state ? mine : true }
      set({ remote, status: 'ok', syncError: null })
      adopt(next)
      await get().sync()
    },

    async unpair() {
      token = null
      meta = { baseRev: 0, dirty: false }
      await Promise.all([writeToken(null), writeJson(KEYS.remote, null)])
      saveMeta()
      set({ remote: null, status: 'local', lastSync: null, syncError: null })
    },

    sync() {
      chain = chain.then(syncOnce, syncOnce)
      return chain
    },
  }
})

/** Whether this device still holds changes the server has not got. */
export const hasUnsent = () => meta.dirty
