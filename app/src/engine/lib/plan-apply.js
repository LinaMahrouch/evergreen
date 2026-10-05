// VENDORED from openGym (frontend/src/lib/plan-apply.js) — AGPL-3.0-or-later, © Duarte Santos.
// Do not edit here: change the source and run `npm run sync:engine`.
/* What an assistant's planning request does to a profile: create or edit a routine, lay out
   the week, move one day, log a weigh-in.

   Each `apply*` is a pure function over a draft of the profile. It either changes the draft
   and returns what it did, or throws (with a `code`) before changing anything that matters —
   the caller saves the draft only when it returns. Two callers share this file: the MCP
   server (mcp/src/plan-tools.js), which saves through the api, and the Evergreen app's
   built-in coach, which saves to the device.

   Routines are built by the plan importer (plan-share.js parsePlan → mergePlan): what an
   assistant creates is byte-for-byte what importing the same plan as a shared file would have
   produced, with the same clamps and the same ids. */
import { EXIDX, allExercises, searchExercises, isCardio } from './exercises.js'
import { defaultConfig, modeOf, fmtSec } from './history.js'
import { POLICIES_FOR, policyFor } from './progression.js'
import { parsePlan, mergePlan } from './plan-share.js'
import { deleteRoutine } from './routines.js'
import { todayISO, fmtNum } from './format.js'

// The routine icons the app's picker offers (glyphs.js GLYPHS). Restated rather than imported:
// glyphs.js reaches into components/Icon.jsx, which plain node cannot load.
export const KNOWN_GLYPHS = [
  'figureStrength', 'arm', 'abs', 'legs', 'pullup',
  'dumbbell', 'barbell', 'kettlebell', 'plate', 'machine',
  'figureRun', 'bike', 'swim', 'boxing', 'timer',
  'stretch', 'moon', 'heart', 'flame', 'bolt'
]
const DEFAULT_GLYPH = 'figureStrength'

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const fail = (code, message) => { const e = new Error(message); e.code = code; throw e }

const customOf = (id, S) => (S.customEx || []).find(ex => ex.id === id)
const exerciseOf = (id, S) => customOf(id, S) || EXIDX[id] || null

/** One exercise as an assistant reads it. */
export const exerciseBrief = ex => ({
  id: ex.id,
  name: ex.n,
  body_part: ex.bp || null,
  equipment: ex.eq || null,
  target: ex.tg || null,
  primary_muscles: ex.primaries || (ex.tg ? [ex.tg] : []),
  secondary_muscles: ex.secondaries || ex.sm || [],
  logged_as: ex.bp === 'cardio' ? 'cardio (minutes at a speed)' : 'sets of reps, or a timed hold when `seconds` is given',
  custom: ex.custom === true || undefined
})

/** The library search behind search_exercises. */
export function findExercises(S, { query, body_part, equipment, limit } = {}) {
  let list = allExercises(S || { customEx: [] })
  if (body_part) list = list.filter(e => e.bp === body_part)
  if (equipment) { const eq = equipment.trim().toLowerCase(); list = list.filter(e => (e.eq || '').toLowerCase() === eq) }
  if (query && query.trim()) list = searchExercises(list, query)
  const lim = limit || 15
  return {
    total_matches: list.length,
    returned: Math.min(lim, list.length),
    exercises: list.slice(0, lim).map(exerciseBrief),
    ...(list.length === 0 ? { hint: 'No match. Try fewer or simpler words, or drop the body_part / equipment filter.' } : {})
  }
}

/** A planned exercise in one plain line, the way a routine lists it ("3 × 8–12 · 40 kg"). */
export function slotLine(cfg, unit) {
  const mode = modeOf(cfg)
  const n = cfg.sets || 1
  const load = cfg.weight ? ' · ' + fmtNum(cfg.weight) + ' ' + unit : ''
  if (mode === 'cardio') return `${n} × ${cfg.min || 20} min @ ${fmtNum(cfg.speed || 8)} km/h`
  if (mode === 'time') return `${n} × ${fmtSec(cfg.sec || 45)}${load}`
  // A double-progression range is stored as its top (`reps`) and bottom (`repsMin`).
  const reps = cfg.repsMin > 0 && cfg.repsMin < cfg.reps ? `${cfg.repsMin}–${cfg.reps}` : `${cfg.reps}`
  return `${n} × ${reps}${load}`
}

/**
 * An assistant's slot → the config object a routine stores. `old` is the slot's previous
 * version when a routine is being edited and still has that exercise: its settings the tool
 * cannot express (a drop-set, a custom increment, per-side counting) are kept.
 */
export function slotToConfig(slot, S, old) {
  const ex = exerciseOf(slot.exercise_id, S)
  if (!ex) fail('ENOENT', `no exercise with id ${JSON.stringify(slot.exercise_id)} — look ids up with search_exercises`)
  const id = ex.id
  const cardio = ex.bp === 'cardio' || isCardio(id)
  const mode = cardio ? 'cardio' : slot.seconds != null ? 'time' : (old && modeOf(old) === 'time' && slot.reps == null ? 'time' : 'reps')
  // Start from the slot it replaces when the logging mode is unchanged, else from the same
  // defaults the app's "add exercise" gives.
  const base = old && modeOf(old) === mode ? { ...old } : { id, ...defaultConfig(id, mode) }
  const cfg = { ...base, id }
  if (slot.sets != null) cfg.sets = slot.sets

  if (mode === 'cardio') {
    if (slot.minutes != null) cfg.min = slot.minutes
    if (slot.speed_kmh != null) cfg.speed = slot.speed_kmh
    if (slot.reps != null || slot.seconds != null || slot.weight != null) {
      fail('EINVAL', `${ex.n} is a cardio exercise: plan it with minutes and speed_kmh, not reps, seconds or weight`)
    }
  } else if (mode === 'time') {
    if (slot.seconds != null) cfg.sec = slot.seconds
    if (slot.weight != null) cfg.weight = slot.weight
    if (slot.reps != null || slot.reps_min != null) fail('EINVAL', `${ex.n}: give either seconds (a timed hold) or reps, not both`)
  } else {
    if (slot.reps != null) cfg.reps = slot.reps
    if (slot.weight != null) cfg.weight = slot.weight
    if (slot.reps_min != null) {
      if (slot.reps_min >= cfg.reps) fail('EINVAL', `${ex.n}: reps_min (${slot.reps_min}) must be below reps (${cfg.reps}), the top of the range`)
      cfg.repsMin = slot.reps_min
      // A range with no rule that climbs it would just open at the bottom forever.
      if (slot.progression == null && !cfg.prog) cfg.prog = 'double'
    }
    // An edit that moved the target below the old range's bottom ("6–8" → 5) leaves no range.
    if (cfg.repsMin != null && cfg.repsMin >= cfg.reps) delete cfg.repsMin
    if (slot.minutes != null || slot.speed_kmh != null) fail('EINVAL', `${ex.n} is not a cardio exercise: minutes and speed_kmh do not apply`)
  }

  if (slot.progression != null) {
    if (!POLICIES_FOR[mode].includes(slot.progression)) {
      fail('EINVAL', `${ex.n}: progression "${slot.progression}" does not apply to a ${mode} exercise (allowed: ${POLICIES_FOR[mode].join(', ')})`)
    }
    cfg.prog = slot.progression
  }
  if (slot.rest_sec != null) { if (slot.rest_sec > 0) cfg.restSec = slot.rest_sec; else delete cfg.restSec }
  if (slot.warmup_sets != null) { if (slot.warmup_sets > 0) cfg.warmupSets = slot.warmup_sets; else delete cfg.warmupSets }
  if (slot.note != null) { if (slot.note.trim()) cfg.note = slot.note.trim(); else delete cfg.note }
  // The label is the group id. Set last, by the caller, once neighbours are known (linkSupersets).
  if (slot.superset != null) cfg.sg = 'sg-' + slot.superset.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  else if (old) delete cfg.sg   // a full replacement list states its supersets; none stated = none
  return cfg
}

/** A superset is neighbours sharing a group. A label only one exercise carries is dropped. */
function linkSupersets(list) {
  list.forEach((cfg, i) => {
    if (!cfg.sg) return
    const paired = list[i - 1]?.sg === cfg.sg || list[i + 1]?.sg === cfg.sg
    if (!paired) delete cfg.sg
  })
  return list
}

function slotsToConfigs(slots, S, previous = []) {
  const pool = previous.slice()
  const out = slots.map(slot => {
    const at = pool.findIndex(o => o && o.id === slot.exercise_id)
    const old = at >= 0 ? pool.splice(at, 1)[0] : null
    return slotToConfig(slot, S, old)
  })
  return linkSupersets(out)
}

const icon = v => (v && KNOWN_GLYPHS.includes(v) ? v : DEFAULT_GLYPH)

export const routineView = (r, S) => ({
  id: r.id,
  name: r.name,
  icon: r.emoji || null,
  progression: policyFor(null, r, 'reps'),
  exercises: (r.ex || []).map((cfg, i) => ({
    position: i + 1,
    id: cfg.id,
    name: exerciseOf(cfg.id, S)?.n || cfg.id,
    summary: slotLine(cfg, S.unit || 'kg'),
    superset: cfg.sg || undefined
  }))
})

export const weekView = S => Object.fromEntries(WEEKDAYS.map((name, d) => [
  name,
  [].concat(S.week?.[d] || []).map(id => (S.routines || []).find(r => r.id === id)).filter(Boolean).map(r => ({ id: r.id, name: r.name }))
]))

/** Adds routines through the app's own plan importer. `schedule` maps weekday → routine keys. */
export function applyPlan(S, { routines, schedule, replace_week }) {
  if (!routines.length) fail('EINVAL', 'a plan needs at least one routine')
  const keys = new Set()
  routines.forEach((r, i) => {
    const key = r.key || String(i + 1)
    if (keys.has(key)) fail('EINVAL', `two routines share the key ${JSON.stringify(key)}`)
    keys.add(key)
  })
  const bundleRoutines = routines.map((r, i) => ({
    id: r.key || String(i + 1),
    name: r.name.trim(),
    emoji: icon(r.icon),
    ...(r.progression ? { prog: r.progression } : {}),
    ex: slotsToConfigs(r.exercises || [], S)
  }))
  const week = {}
  for (const [dayName, list] of Object.entries(schedule || {})) {
    const d = WEEKDAYS.indexOf(dayName)
    if (d < 0) fail('EINVAL', `unknown weekday ${JSON.stringify(dayName)}`)
    for (const key of list) if (!keys.has(key)) fail('EINVAL', `${dayName} names routine key ${JSON.stringify(key)}, which this plan does not define`)
    if (list.length) week[d] = list
  }
  // Customs the plan uses ride along so parsePlan's "does every id resolve" check sees them;
  // mergePlan then finds each by name and reuses it rather than adding a second copy.
  const used = new Set(bundleRoutines.flatMap(r => r.ex.map(e => e.id)))
  const bundle = parsePlan({
    opengym_plan: 1,
    unit: S.unit === 'lb' ? 'lb' : 'kg',
    routines: bundleRoutines,
    week,
    customEx: (S.customEx || []).filter(c => used.has(c.id))
  }, S.unit === 'lb' ? 'lb' : 'kg')
  if (bundle.dropped) fail('EINVAL', 'some exercises could not be resolved — look ids up with search_exercises')
  const before = new Set((S.routines || []).map(r => r.id))
  const hasSchedule = Object.keys(week).length > 0
  // mergePlan's schedule switch replaces the whole week. When the caller only wants the listed
  // days changed, the plan's days are written onto the existing week instead.
  if (hasSchedule && !replace_week) {
    const keep = { ...(S.week || {}) }
    mergePlan(S, bundle, { schedule: true })
    S.week = { ...keep, ...S.week }
  } else {
    mergePlan(S, bundle, { schedule: hasSchedule })
  }
  const created = S.routines.filter(r => !before.has(r.id))
  return { created: created.map(r => routineView(r, S)), week: weekView(S), unit: S.unit || 'kg' }
}

export function applyUpdateRoutine(S, { routine_id, name, icon: iconKey, progression, exercises }) {
  const r = (S.routines || []).find(x => x.id === routine_id)
  if (!r) fail('ENOENT', `no routine with id ${JSON.stringify(routine_id)} — see list_routines`)
  if (name != null) r.name = name.trim()
  if (iconKey != null) r.emoji = icon(iconKey)
  if (progression != null) r.prog = progression
  if (exercises != null) r.ex = slotsToConfigs(exercises, S, r.ex || [])
  return { updated: routineView(r, S), unit: S.unit || 'kg' }
}

export function applyDeleteRoutine(S, { routine_id, confirm_name }) {
  const r = (S.routines || []).find(x => x.id === routine_id)
  if (!r) fail('ENOENT', `no routine with id ${JSON.stringify(routine_id)} — see list_routines`)
  if ((confirm_name || '').trim().toLowerCase() !== (r.name || '').trim().toLowerCase()) {
    fail('ECONFIRM', `confirm_name must be the routine's exact name (${JSON.stringify(r.name)}) — this guards against deleting the wrong one`)
  }
  S.week = S.week || {}
  S.dayPlan = S.dayPlan || {}
  const dropped = deleteRoutine(S, routine_id)
  return {
    deleted: { id: r.id, name: r.name },
    note: 'Logged workouts that used this routine are kept. It was also taken off every weekday it was scheduled on.',
    cleared_day_overrides: Object.keys(dropped),
    week: weekView(S)
  }
}

export function applyWeekPlan(S, { days, replace_week }) {
  S.week = S.week || {}
  const known = new Set((S.routines || []).map(r => r.id))
  const next = replace_week ? {} : { ...S.week }
  for (const [dayName, ids] of Object.entries(days || {})) {
    const d = WEEKDAYS.indexOf(dayName)
    if (d < 0) fail('EINVAL', `unknown weekday ${JSON.stringify(dayName)}`)
    for (const id of ids) if (!known.has(id)) fail('ENOENT', `${dayName}: no routine with id ${JSON.stringify(id)} — see list_routines`)
    // An absent key is a rest day; the app never stores an empty list.
    if (ids.length) next[d] = [...new Set(ids)]; else delete next[d]
  }
  S.week = next
  return { week: weekView(S) }
}

export function applyDayOverride(S, { date, routine_id, rest, clear }) {
  if ([routine_id != null, rest === true, clear === true].filter(Boolean).length !== 1) {
    fail('EINVAL', 'give exactly one of routine_id, rest: true, or clear: true')
  }
  S.dayPlan = S.dayPlan || {}
  if (clear) { delete S.dayPlan[date]; return { date, override: null, note: 'The weekly plan applies again on this date.' } }
  if (rest) { S.dayPlan[date] = 'rest'; return { date, override: 'rest' } }
  const r = (S.routines || []).find(x => x.id === routine_id)
  if (!r) fail('ENOENT', `no routine with id ${JSON.stringify(routine_id)} — see list_routines`)
  S.dayPlan[date] = r.id
  return { date, override: { id: r.id, name: r.name } }
}

export function applyBodyweight(S, { weight, date }, now = Date.now()) {
  const d = date || todayISO()
  if (d > todayISO()) fail('EINVAL', `${d} is in the future`)
  const w = Math.round(weight * 10) / 10
  // One weigh-in per day, like the app's own card: a second one that day replaces the first.
  S.bodyweight = [...(S.bodyweight || []).filter(b => b && b.d !== d), { d, w, t: now }].sort((a, b) => (a.d < b.d ? -1 : 1))
  return { date: d, weight: w, unit: S.unit || 'kg', goal: S.targetW || null }
}
