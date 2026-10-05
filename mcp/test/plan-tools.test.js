// The planning tools (mcp/src/plan-tools.js) and the write path under them (state.js mutate).
// The appliers are pure over a draft, so most of this needs no server; the last block drives
// mutate() against a fake api that answers 409 the way the real one does.
import { describe, beforeEach, test, expect } from 'vitest'
import { buildDemoState } from '../../frontend/src/lib/demoSeed.js'
import { EXDB } from '../../frontend/src/lib/exercises.js'
import { _seedStateForTests, _seedRemoteForTests, mutate, refresh, getState } from '../src/state.js'
import { TOOLS } from '../src/tools.js'
import {
  PLAN_TOOLS, slotToConfig, applyPlan, applyUpdateRoutine, applyDeleteRoutine, applyWeekPlan,
  applyDayOverride, applyBodyweight
} from '../src/plan-tools.js'

const BENCH = '0025'
const SQUAT = '0043'
const LATERAL = '0334'
const PUSHDOWN = '0241'
const CARDIO = EXDB.find(e => e.bp === 'cardio').id

const tool = name => [...TOOLS, ...PLAN_TOOLS].find(t => t.name === name).handler
const fresh = () => { const s = buildDemoState(); s.unit = 'kg'; return s }
const codeOf = fn => { try { fn(); return null } catch (e) { return e.code } }

let S
beforeEach(() => { S = fresh(); _seedStateForTests(S) })

/* ---------- slots ---------- */

describe('slotToConfig', () => {
  test('a bare id gets the same defaults the app\'s "add exercise" gives', () => {
    expect(slotToConfig({ exercise_id: BENCH }, S)).toMatchObject({ id: BENCH, sets: 3, reps: 10, weight: 0, mode: 'reps' })
  })

  test('a rep range is stored as its top and bottom and climbs by double progression', () => {
    const cfg = slotToConfig({ exercise_id: BENCH, sets: 4, reps: 12, reps_min: 8, weight: 60 }, S)
    expect(cfg).toMatchObject({ sets: 4, reps: 12, repsMin: 8, weight: 60, prog: 'double' })
  })

  test('an explicit progression beats the range\'s default', () => {
    expect(slotToConfig({ exercise_id: BENCH, reps: 12, reps_min: 8, progression: 'linear' }, S).prog).toBe('linear')
  })

  test('a range whose bottom is not below its top is refused', () => {
    expect(codeOf(() => slotToConfig({ exercise_id: BENCH, reps: 8, reps_min: 8 }, S))).toBe('EINVAL')
  })

  test('seconds makes a timed hold', () => {
    const cfg = slotToConfig({ exercise_id: SQUAT, sets: 3, seconds: 45 }, S)
    expect(cfg).toMatchObject({ mode: 'time', sec: 45, sets: 3 })
    expect(cfg.reps).toBeUndefined()
  })

  test('cardio is minutes at a speed, and refuses reps or weight', () => {
    expect(slotToConfig({ exercise_id: CARDIO, minutes: 30, speed_kmh: 10 }, S)).toMatchObject({ sets: 1, min: 30, speed: 10 })
    expect(codeOf(() => slotToConfig({ exercise_id: CARDIO, reps: 10 }, S))).toBe('EINVAL')
    expect(codeOf(() => slotToConfig({ exercise_id: BENCH, minutes: 10 }, S))).toBe('EINVAL')
  })

  test('a progression rule that does not fit the logging mode is refused', () => {
    expect(codeOf(() => slotToConfig({ exercise_id: BENCH, progression: 'time' }, S))).toBe('EINVAL')
  })

  test('an unknown id is refused, and says where ids come from', () => {
    expect(() => slotToConfig({ exercise_id: 'bench press' }, S)).toThrow(/search_exercises/)
  })

  test('a custom exercise of the profile resolves', () => {
    S.customEx = [{ id: 'cx1', n: 'Landmine press', bp: 'shoulders', custom: true }]
    expect(slotToConfig({ exercise_id: 'cx1', sets: 2 }, S)).toMatchObject({ id: 'cx1', sets: 2 })
  })
})

/* ---------- create ---------- */

describe('applyPlan', () => {
  const plan = {
    routines: [
      { key: 'a', name: ' Upper ', icon: 'barbell', progression: 'double', exercises: [
        { exercise_id: BENCH, sets: 4, reps: 8, reps_min: 6, weight: 60, rest_sec: 150, note: 'pause' },
        { exercise_id: LATERAL, superset: 'A' }, { exercise_id: PUSHDOWN, superset: 'A' }] },
      { key: 'b', name: 'Lower', exercises: [{ exercise_id: SQUAT, sets: 5, reps: 5 }] }
    ],
    schedule: { monday: ['a'], thursday: ['a', 'b'] }
  }

  test('adds the routines with fresh ids and leaves every existing routine alone', () => {
    const before = JSON.stringify(S.routines)
    const n = S.routines.length
    const out = applyPlan(S, plan)
    expect(S.routines).toHaveLength(n + 2)
    expect(JSON.stringify(S.routines.slice(0, n))).toBe(before)
    expect(out.created.map(r => r.name)).toEqual(['Upper', 'Lower'])
    expect(new Set(S.routines.map(r => r.id)).size).toBe(S.routines.length)
    const upper = S.routines.at(-2)
    expect(upper).toMatchObject({ name: 'Upper', emoji: 'barbell', prog: 'double' })
    expect(upper.ex[0]).toMatchObject({ id: BENCH, sets: 4, reps: 8, repsMin: 6, weight: 60, restSec: 150, note: 'pause' })
  })

  test('neighbours sharing a label become one superset', () => {
    applyPlan(S, plan)
    const upper = S.routines.at(-2)
    expect(upper.ex[1].sg).toBeTruthy()
    expect(upper.ex[1].sg).toBe(upper.ex[2].sg)
    expect(upper.ex[0].sg).toBeUndefined()
  })

  test('a superset label only one exercise carries is dropped', () => {
    applyPlan(S, { routines: [{ key: 'x', name: 'Solo', exercises: [{ exercise_id: BENCH, superset: 'A' }, { exercise_id: SQUAT }] }] })
    expect(S.routines.at(-1).ex[0].sg).toBeUndefined()
  })

  test('the listed days are assigned and the others keep what they had', () => {
    const wednesday = JSON.stringify(S.week[3])
    applyPlan(S, plan)
    const [upper, lower] = S.routines.slice(-2)
    expect(S.week[1]).toEqual([upper.id])
    expect(S.week[4]).toEqual([upper.id, lower.id])
    expect(JSON.stringify(S.week[3])).toBe(wednesday)
  })

  test('replace_week turns every unlisted day into a rest day', () => {
    applyPlan(S, { ...plan, replace_week: true })
    expect(Object.keys(S.week).sort()).toEqual(['1', '4'])
  })

  test('without a schedule the week is not touched', () => {
    const week = JSON.stringify(S.week)
    applyPlan(S, { routines: plan.routines })
    expect(JSON.stringify(S.week)).toBe(week)
  })

  test('a schedule naming a key the plan does not define is refused', () => {
    expect(codeOf(() => applyPlan(S, { routines: plan.routines, schedule: { monday: ['zzz'] } }))).toBe('EINVAL')
  })

  test('two routines under one key are refused', () => {
    expect(codeOf(() => applyPlan(S, { routines: [plan.routines[0], { ...plan.routines[1], key: 'a' }] }))).toBe('EINVAL')
  })

  test('a routine may use a custom exercise without duplicating it', () => {
    S.customEx = [{ id: 'cx1', n: 'Landmine press', bp: 'shoulders', custom: true }]
    applyPlan(S, { routines: [{ key: 'x', name: 'Custom day', exercises: [{ exercise_id: 'cx1' }] }] })
    expect(S.customEx).toHaveLength(1)
    expect(S.routines.at(-1).ex[0].id).toBe('cx1')
  })
})

/* ---------- edit ---------- */

describe('applyUpdateRoutine', () => {
  test('renames in place and keeps the id', () => {
    const r = S.routines[0]
    applyUpdateRoutine(S, { routine_id: r.id, name: 'Renamed' })
    expect(S.routines[0]).toMatchObject({ id: r.id, name: 'Renamed' })
  })

  test('an exercise that stays keeps what the tool cannot express, and fields left out', () => {
    const r = S.routines[0]
    r.ex = [{ id: BENCH, sets: 3, reps: 10, weight: 80, mode: 'reps', restSec: 120, intensifier: { type: 'dropset', count: 2, pct: 20 }, inc: 1.25 }]
    applyUpdateRoutine(S, { routine_id: r.id, exercises: [{ exercise_id: BENCH, sets: 5 }, { exercise_id: SQUAT }] })
    expect(r.ex[0]).toMatchObject({ id: BENCH, sets: 5, reps: 10, weight: 80, restSec: 120, inc: 1.25, intensifier: { type: 'dropset', count: 2, pct: 20 } })
    expect(r.ex[1]).toMatchObject({ id: SQUAT, sets: 3, reps: 10 })
  })

  test('an exercise left out of the list is removed', () => {
    const r = S.routines[0]
    applyUpdateRoutine(S, { routine_id: r.id, exercises: [{ exercise_id: SQUAT }] })
    expect(r.ex.map(e => e.id)).toEqual([SQUAT])
  })

  test('moving the target below an old range leaves no range behind', () => {
    const r = S.routines[0]
    r.ex = [{ id: BENCH, sets: 4, reps: 8, repsMin: 6, weight: 60, mode: 'reps', prog: 'double' }]
    applyUpdateRoutine(S, { routine_id: r.id, exercises: [{ exercise_id: BENCH, reps: 5 }] })
    expect(r.ex[0].reps).toBe(5)
    expect(r.ex[0].repsMin).toBeUndefined()
  })

  test('rest_sec 0 hands the exercise back to the default timer', () => {
    const r = S.routines[0]
    r.ex = [{ id: BENCH, sets: 3, reps: 10, weight: 0, mode: 'reps', restSec: 120 }]
    applyUpdateRoutine(S, { routine_id: r.id, exercises: [{ exercise_id: BENCH, rest_sec: 0 }] })
    expect(r.ex[0].restSec).toBeUndefined()
  })

  test('an unknown routine is refused', () => {
    expect(codeOf(() => applyUpdateRoutine(S, { routine_id: 'nope', name: 'x' }))).toBe('ENOENT')
  })
})

describe('applyDeleteRoutine', () => {
  test('needs the exact name', () => {
    const r = S.routines[0]
    expect(codeOf(() => applyDeleteRoutine(S, { routine_id: r.id, confirm_name: 'something else' }))).toBe('ECONFIRM')
    expect(S.routines.some(x => x.id === r.id)).toBe(true)
  })

  test('removes the routine from the plan, the week and day overrides, and keeps the history', () => {
    const r = S.routines[0]
    S.week[1] = [r.id]
    S.dayPlan['2026-08-01'] = r.id
    const workouts = S.workouts.length
    const out = applyDeleteRoutine(S, { routine_id: r.id, confirm_name: r.name.toUpperCase() })
    expect(S.routines.some(x => x.id === r.id)).toBe(false)
    expect(S.week[1]).toBeUndefined()
    expect(S.dayPlan['2026-08-01']).toBeUndefined()
    expect(out.cleared_day_overrides).toEqual(['2026-08-01'])
    expect(S.workouts).toHaveLength(workouts)
  })
})

/* ---------- schedule ---------- */

describe('applyWeekPlan', () => {
  test('sets the listed days, rests a day given an empty list, leaves the rest', () => {
    const [a, b] = S.routines
    S.week = { 1: [a.id], 3: [a.id], 5: [b.id] }
    applyWeekPlan(S, { days: { monday: [b.id], wednesday: [], saturday: [a.id, b.id] } })
    expect(S.week).toEqual({ 1: [b.id], 5: [b.id], 6: [a.id, b.id] })
  })

  test('replace_week rests every day not listed', () => {
    const [a, b] = S.routines
    S.week = { 1: [a.id], 3: [a.id], 5: [b.id] }
    applyWeekPlan(S, { days: { tuesday: [a.id] }, replace_week: true })
    expect(S.week).toEqual({ 2: [a.id] })
  })

  test('an unknown routine id is refused before anything changes', () => {
    const week = JSON.stringify(S.week)
    expect(codeOf(() => applyWeekPlan(S, { days: { monday: ['nope'] } }))).toBe('ENOENT')
    expect(JSON.stringify(S.week)).toBe(week)
  })
})

describe('applyDayOverride', () => {
  test('a routine, a rest day, and clearing', () => {
    const r = S.routines[0]
    applyDayOverride(S, { date: '2026-08-03', routine_id: r.id })
    expect(S.dayPlan['2026-08-03']).toBe(r.id)
    applyDayOverride(S, { date: '2026-08-03', rest: true })
    expect(S.dayPlan['2026-08-03']).toBe('rest')
    applyDayOverride(S, { date: '2026-08-03', clear: true })
    expect('2026-08-03' in S.dayPlan).toBe(false)
  })

  test('exactly one of the three', () => {
    expect(codeOf(() => applyDayOverride(S, { date: '2026-08-03' }))).toBe('EINVAL')
    expect(codeOf(() => applyDayOverride(S, { date: '2026-08-03', rest: true, clear: true }))).toBe('EINVAL')
  })
})

describe('applyBodyweight', () => {
  test('one weigh-in per day, kept in date order', () => {
    S.bodyweight = [{ d: '2020-01-01', w: 80, t: 1 }, { d: '2020-01-03', w: 79, t: 3 }]
    applyBodyweight(S, { weight: 79.56, date: '2020-01-02' }, 5)
    applyBodyweight(S, { weight: 78, date: '2020-01-03' }, 6)
    expect(S.bodyweight).toEqual([{ d: '2020-01-01', w: 80, t: 1 }, { d: '2020-01-02', w: 79.6, t: 5 }, { d: '2020-01-03', w: 78, t: 6 }])
  })

  test('a future date is refused', () => {
    expect(codeOf(() => applyBodyweight(S, { weight: 80, date: '2999-01-01' }))).toBe('EINVAL')
  })
})

/* ---------- the existing week reader ---------- */

describe('get_week_plan', () => {
  test('reads a weekday that holds a list of routines', () => {
    const [a, b] = S.routines
    S.week = { 1: [a.id, b.id], 2: a.id }
    const out = tool('get_week_plan')({})
    expect(out.weekdays[1]).toMatchObject({ routine_id: a.id, routine_name: a.name, routines: [{ id: a.id, name: a.name }, { id: b.id, name: b.name }] })
    expect(out.weekdays[2]).toMatchObject({ routine_id: a.id, routine_name: a.name })
    expect(out.weekdays[3]).toMatchObject({ routine_id: null, routines: [] })
  })
})

/* ---------- search ---------- */

describe('search_exercises', () => {
  test('finds by name and returns ids', () => {
    const out = tool('search_exercises')({ query: 'barbell bench press' })
    expect(out.exercises[0]).toMatchObject({ id: BENCH, name: 'barbell bench press', body_part: 'chest', equipment: 'barbell' })
  })

  test('tolerates a typo', () => {
    expect(tool('search_exercises')({ query: 'dumbell curl' }).total_matches).toBeGreaterThan(0)
  })

  test('filters by body part and equipment, and caps the list', () => {
    const out = tool('search_exercises')({ body_part: 'chest', equipment: 'Dumbbell', limit: 5 })
    expect(out.returned).toBe(5)
    expect(out.exercises.every(e => e.body_part === 'chest' && e.equipment === 'dumbbell')).toBe(true)
  })

  test('includes the profile\'s own exercises', () => {
    S.customEx = [{ id: 'cx1', n: 'Zercher landmine twist', bp: 'waist', custom: true }]
    expect(tool('search_exercises')({ query: 'zercher landmine' }).exercises[0]).toMatchObject({ id: 'cx1', custom: true })
  })
})

/* ---------- the write path ---------- */

// A stand-in for the api's GET/PUT /api/data: a document with a revision, a conditional write
// that answers 409 with the current document, and a hook to let "another device" write between
// this client's read and its write.
function fakeApi(initial) {
  const srv = { state: initial, rev: initial ? 1 : 0, puts: 0, beforePut: null }
  srv.request = async (auth, method, route, body) => {
    if (route === '/api/me') return { status: 200, body: { user: { id: 'u1', name: 'Tester' } } }
    if (route === '/api/data/rev') return { status: 200, body: { rev: srv.rev } }
    if (method === 'GET' && route === '/api/data') return { status: 200, body: { state: srv.state ? structuredClone(srv.state) : null, rev: srv.rev } }
    if (method === 'PUT' && route === '/api/data') {
      srv.puts++
      if (srv.beforePut) { const hook = srv.beforePut; srv.beforePut = null; hook(srv) }
      if (body.baseRev !== srv.rev) return { status: 409, body: { error: 'conflict', rev: srv.rev, state: structuredClone(srv.state) } }
      srv.rev++
      srv.state = { ...structuredClone(body.state), _rev: srv.rev }
      return { status: 200, body: { ok: true, rev: srv.rev } }
    }
    throw new Error('unexpected request ' + method + ' ' + route)
  }
  return srv
}

describe('mutate', () => {
  test('file mode is read-only and says how to enable writing', async () => {
    _seedStateForTests(fresh())
    await expect(mutate(() => {})).rejects.toMatchObject({ code: 'EREADONLY' })
    await expect(mutate(() => {})).rejects.toThrow(/npm run pair/)
    expect(tool('planning_status')({}).can_write).toBe(false)
  })

  test('saves on top of the revision it read and stamps what it touched', async () => {
    const srv = fakeApi({ ...fresh(), _ts: 1000 })
    _seedRemoteForTests(srv.request)
    const out = await tool('create_routine')({ name: 'Agent day', exercises: [{ exercise_id: BENCH }] })
    expect(srv.rev).toBe(2)
    expect(out.saved_rev).toBe(2)
    const made = srv.state.routines.at(-1)
    expect(made).toMatchObject({ id: out.created.id, name: 'Agent day' })
    // The stamp a device's merge keeps "the routine edited last" by — and the untouched ones keep theirs.
    expect(made._ts).toBeGreaterThan(1000)
    expect(srv.state._ts).toBe(made._ts)
    expect(srv.state.routines[0]._ts).toBeUndefined()
    expect(tool('planning_status')({}).can_write).toBe(true)
  })

  test('a write from another device in between is kept: the change is applied again on top of it', async () => {
    const srv = fakeApi(fresh())
    _seedRemoteForTests(srv.request)
    // The phone logs a weigh-in and adds a routine after this client read the document.
    srv.beforePut = s => {
      s.state = { ...s.state, bodyweight: [...s.state.bodyweight, { d: '2026-07-28', w: 77.7, t: 9 }], routines: [...s.state.routines, { id: 'phone-made', name: 'Phone routine', ex: [] }] }
      s.rev++
    }
    await tool('create_routine')({ name: 'Agent day', exercises: [{ exercise_id: BENCH }] })
    expect(srv.puts).toBe(2)                                                  // refused once, then saved
    expect(srv.state.bodyweight.some(b => b.d === '2026-07-28' && b.w === 77.7)).toBe(true)
    expect(srv.state.routines.map(r => r.name)).toEqual(expect.arrayContaining(['Phone routine', 'Agent day']))
    expect(srv.state.routines.filter(r => r.name === 'Agent day')).toHaveLength(1)
  })

  test('a tool that rejects its input writes nothing', async () => {
    const srv = fakeApi(fresh())
    _seedRemoteForTests(srv.request)
    await expect(tool('create_routine')({ name: 'Bad', exercises: [{ exercise_id: 'nope' }] })).rejects.toMatchObject({ code: 'ENOENT' })
    expect(srv.puts).toBe(0)
    expect(srv.rev).toBe(1)
  })

  test('gives up, without writing, when the profile never stops changing', async () => {
    const srv = fakeApi(fresh())
    _seedRemoteForTests(srv.request)
    const original = srv.request
    srv.request = async (auth, method, route, body) => {
      if (method === 'PUT') srv.rev++          // someone else always gets there first
      return original(auth, method, route, body)
    }
    _seedRemoteForTests(srv.request)
    await expect(mutate(S => { S.targetW = 70 })).rejects.toMatchObject({ code: 'ECONFLICT' })
    expect(srv.state.targetW).not.toBe(70)
  })

  test('a profile with no document yet gets one', async () => {
    const srv = fakeApi(null)
    _seedRemoteForTests(srv.request)
    await tool('create_plan')({ routines: [{ key: 'a', name: 'First', exercises: [{ exercise_id: SQUAT }] }], schedule: { monday: ['a'] } })
    expect(srv.state.routines).toHaveLength(1)
    expect(srv.state.week[1]).toEqual([srv.state.routines[0].id])
  })

  test('reads follow the server: a change made elsewhere shows on the next refresh', async () => {
    const srv = fakeApi(fresh())
    _seedRemoteForTests(srv.request)
    await refresh()
    const n = getState().routines.length
    srv.state = { ...srv.state, routines: [...srv.state.routines, { id: 'elsewhere', name: 'Made elsewhere', ex: [] }] }
    srv.rev++
    await refresh()
    expect(getState().routines).toHaveLength(n + 1)
  })
})
