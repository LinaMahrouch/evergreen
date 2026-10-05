/* The planning tools: one more read (search_exercises) and the writes an assistant needs to
   plan training — create or edit a routine, lay out the week, move one day, log a weigh-in.

   Every write is a pure function over a draft of the profile (`apply*`, exported for the tests)
   handed to state.js `mutate`, which saves it through the api's conditional PUT. So a write
   either lands whole on top of the current document or not at all, and a tool that rejects its
   input rejects it before anything is saved.

   The routines themselves are built by the app's own plan importer (lib/plan-share.js
   parsePlan → mergePlan): what an assistant creates here is byte-for-byte what importing the
   same plan as a shared file would have produced, with the same clamps and the same ids. */
import { z } from 'zod'
import { getState, mutate, isRemote } from './state.js'
import { exLine } from './labels.js'
import { EXIDX, allExercises, searchExercises, isCardio, BODYPARTS } from '../../frontend/src/lib/exercises.js'
import { defaultConfig, modeOf, MAX_PLANNED_WARMUPS } from '../../frontend/src/lib/history.js'
import { POLICIES_FOR, policyFor } from '../../frontend/src/lib/progression.js'
import { parsePlan, mergePlan } from '../../frontend/src/lib/plan-share.js'
import { deleteRoutine } from '../../frontend/src/lib/routines.js'
import { todayISO } from '../../frontend/src/lib/format.js'

// The routine icons the app's picker offers (frontend/src/lib/glyphs.js GLYPHS). Restated
// rather than imported: glyphs.js reaches into components/Icon.jsx, which plain node cannot
// load — and this server runs under plain node (scripts/check-node-loadable.mjs).
const KNOWN_GLYPHS = [
  'figureStrength', 'arm', 'abs', 'legs', 'pullup',
  'dumbbell', 'barbell', 'kettlebell', 'plate', 'machine',
  'figureRun', 'bike', 'swim', 'boxing', 'timer',
  'stretch', 'moon', 'heart', 'flame', 'bolt'
]
const DEFAULT_GLYPH = 'figureStrength'

/* ---------- shared ---------- */

const fail = (code, message) => { const e = new Error(message); e.code = code; throw e }

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ISO = /^\d{4}-\d{2}-\d{2}$/

const customOf = (id, S) => (S.customEx || []).find(ex => ex.id === id)
const exerciseOf = (id, S) => customOf(id, S) || EXIDX[id] || null

const exerciseBrief = ex => ({
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

/** One planned exercise as an assistant writes it. Everything but the id is optional. */
const slotSchema = z.object({
  exercise_id: z.string().min(1).describe('An id from search_exercises (e.g. "0025" is the barbell bench press).'),
  sets: z.number().int().min(1).max(20).optional().describe('Work sets. Default 3 (1 for cardio).'),
  reps: z.number().int().min(1).max(200).optional().describe('Target reps per set. With reps_min this is the TOP of the range. Default 10.'),
  reps_min: z.number().int().min(1).max(200).optional().describe('Bottom of a rep range ("8–12" is reps_min 8, reps 12). Turns on double progression unless `progression` says otherwise.'),
  weight: z.number().min(0).max(2000).optional().describe('Starting load in the profile unit (see `unit` in the answer). 0 or omitted lets the app carry the weight over from the last session; for a bodyweight exercise it is ADDED weight.'),
  seconds: z.number().int().min(1).max(7200).optional().describe('Makes it a timed hold (plank, hang, carry): seconds per set instead of reps.'),
  minutes: z.number().min(1).max(600).optional().describe('Cardio only: minutes per bout. Default 20.'),
  speed_kmh: z.number().min(0.1).max(100).optional().describe('Cardio only: speed in km/h. Default 8.'),
  rest_sec: z.number().int().min(0).max(1800).optional().describe('Rest after each set of this exercise. Omit to use the profile\'s default rest timer.'),
  warmup_sets: z.number().int().min(0).max(MAX_PLANNED_WARMUPS).optional().describe('Ramp-up sets the app adds before the work sets.'),
  superset: z.string().min(1).max(24).optional().describe('A label, e.g. "A". Neighbouring exercises with the same label are done as a superset.'),
  progression: z.enum(['off', 'linear', 'greyskull', 'double', 'time']).optional().describe('Overrides the routine\'s progression rule for this exercise.'),
  note: z.string().max(400).optional().describe('A cue shown with the exercise ("pause at the bottom").')
})

const routineFields = {
  name: z.string().min(1).max(60),
  icon: z.string().max(40).optional().describe(`Icon key shown beside the name. One of: ${KNOWN_GLYPHS.join(', ')}.`),
  progression: z.enum(['off', 'linear', 'greyskull', 'double']).optional().describe('The routine\'s rule for adding load over time. linear: add weight each session all reps were hit. double: add reps through a range, then weight. greyskull: linear with an AMRAP last set. off: targets stay put. Default linear.')
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

const routineView = (r, S) => ({
  id: r.id,
  name: r.name,
  icon: r.emoji || null,
  progression: policyFor(null, r, 'reps'),
  exercises: (r.ex || []).map((cfg, i) => ({
    position: i + 1,
    id: cfg.id,
    name: exerciseOf(cfg.id, S)?.n || cfg.id,
    summary: exLine(cfg, S.unit || 'kg'),
    superset: cfg.sg || undefined
  }))
})

const weekView = S => Object.fromEntries(WEEKDAYS.map((name, d) => [
  name,
  [].concat(S.week?.[d] || []).map(id => (S.routines || []).find(r => r.id === id)).filter(Boolean).map(r => ({ id: r.id, name: r.name }))
]))

/* ---------- pure appliers (what each write does to a draft) ---------- */

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

/* ---------- tools ---------- */

const writeNote = ' WRITES to the profile: the change shows up in the app on every signed-in device within about half a minute.'

export const searchExercisesTool = {
  name: 'search_exercises',
  description: 'Search the exercise library (1,324 built-in exercises plus the user\'s own) by name, and optionally narrow by body part or equipment. Returns exercise ids — every planning tool needs these ids, never names. Search before creating or editing a routine. The search tolerates typos ("dumbell", "bnech"). With no query it lists the library filtered by body_part / equipment.',
  schema: {
    query: z.string().max(80).optional().describe('Words from the exercise name, e.g. "incline dumbbell press", "pull up", "plank".'),
    body_part: z.enum(BODYPARTS).optional().describe('Narrow to one body part.'),
    equipment: z.string().max(40).optional().describe('Narrow to one kind of equipment, e.g. "barbell", "dumbbell", "cable", "body weight", "kettlebell", "leverage machine", "band".'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results. Default 15.')
  },
  handler: ({ query, body_part, equipment, limit }) => {
    const S = getState() || { customEx: [] }
    let list = allExercises(S)
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
}

export const createRoutine = {
  name: 'create_routine',
  description: 'Create one new workout routine: a named list of exercises with set/rep targets. It is added to the profile as a new routine and does not replace any existing one; it is NOT scheduled on a weekday until set_week_plan puts it there. Find exercise ids with search_exercises first. To build a whole week in one go, use create_plan instead.' + writeNote,
  schema: { ...routineFields, exercises: z.array(slotSchema).min(1).max(30) },
  handler: async params => {
    const out = await mutate(S => applyPlan(S, { routines: [{ ...params, key: 'r' }], schedule: {} }))
    return { created: out.result.created[0], unit: out.result.unit, saved_rev: out.rev }
  }
}

export const createPlan = {
  name: 'create_plan',
  description: 'Create a whole training plan in one step: several routines plus the weekdays they fall on. Each routine gets a `key` you choose ("push", "legs-a"), and `schedule` maps weekday names to those keys. Days you list are (re)assigned; days you leave out keep what they have unless replace_week is true, which turns every unlisted day into a rest day. Existing routines are never overwritten or deleted — the new ones are added beside them. Read the current state first (list_routines, get_week_plan, list_workouts, muscle_balance) so the plan fits what the athlete already does.' + writeNote,
  schema: {
    routines: z.array(z.object({
      key: z.string().min(1).max(30).describe('Your handle for this routine inside this call, used by `schedule`.'),
      ...routineFields,
      exercises: z.array(slotSchema).min(1).max(30)
    })).min(1).max(14),
    schedule: z.record(z.enum(WEEKDAYS), z.array(z.string()).max(4)).optional().describe('Weekday → routine keys, e.g. {"monday": ["push"], "wednesday": ["pull"], "friday": ["legs"]}. Two keys on one day make a combined session.'),
    replace_week: z.boolean().optional().describe('true: the week becomes exactly `schedule`; every day not listed turns into a rest day. Default false: only the listed days change.')
  },
  handler: async params => {
    const out = await mutate(S => applyPlan(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

export const updateRoutine = {
  name: 'update_routine',
  description: 'Change an existing routine in place: its name, icon, progression rule, and/or its exercises. `exercises`, when given, REPLACES the whole list in the order given — call get_routine first and send back every exercise you want to keep; one you leave out is removed. For an exercise that stays, any field you omit keeps its current value (so {exercise_id, sets: 4} only changes the set count), including settings this tool cannot express (drop-sets, custom increments). Supersets are the exception: restate the `superset` label on every member, an exercise sent without one leaves its superset. The routine keeps its id, so the weekdays it is scheduled on and its history stay attached.' + writeNote,
  schema: {
    routine_id: z.string().min(1),
    name: routineFields.name.optional(),
    icon: routineFields.icon,
    progression: routineFields.progression,
    exercises: z.array(slotSchema).min(1).max(30).optional()
  },
  handler: async params => {
    if (params.name == null && params.icon == null && params.progression == null && params.exercises == null) {
      fail('EINVAL', 'nothing to change: give at least one of name, icon, progression, exercises')
    }
    const out = await mutate(S => applyUpdateRoutine(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

export const deleteRoutineTool = {
  name: 'delete_routine',
  description: 'Delete a routine from the plan. Logged workouts are kept; the routine is removed from every weekday and day override that pointed at it. Only do this when the user asked for it — to stop using a routine without losing it, take it off the week with set_week_plan instead. Requires confirm_name: the routine\'s exact current name.' + writeNote,
  schema: {
    routine_id: z.string().min(1),
    confirm_name: z.string().min(1).describe('The exact name of the routine, as a guard against deleting the wrong one.')
  },
  handler: async params => {
    const out = await mutate(S => applyDeleteRoutine(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

export const setWeekPlan = {
  name: 'set_week_plan',
  description: 'Put routines on weekdays. `days` maps weekday names to lists of routine ids (from list_routines): one id is a normal training day, two make a combined session, and an empty list makes that day a rest day. Days you do not mention are left as they are, unless replace_week is true.' + writeNote,
  schema: {
    days: z.record(z.enum(WEEKDAYS), z.array(z.string().min(1)).max(4)).describe('e.g. {"monday": ["<routine id>"], "tuesday": []}'),
    replace_week: z.boolean().optional().describe('true: every weekday not listed becomes a rest day. Default false.')
  },
  handler: async params => {
    const out = await mutate(S => applyWeekPlan(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

export const setDayOverride = {
  name: 'set_day_override',
  description: 'Change what is planned on ONE calendar date without touching the weekly plan: train a different routine that day (routine_id), make it a rest day (rest: true), or remove an earlier override (clear: true). Use this for "I can\'t train Thursday, move it to Friday" — two calls, one per date.' + writeNote,
  schema: {
    date: z.string().regex(ISO).describe('YYYY-MM-DD'),
    routine_id: z.string().min(1).optional(),
    rest: z.boolean().optional(),
    clear: z.boolean().optional()
  },
  handler: async params => {
    const out = await mutate(S => applyDayOverride(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

export const logBodyweight = {
  name: 'log_bodyweight',
  description: 'Log a body-weight weigh-in in the profile\'s unit (kg or lb — see get_bodyweight). One weigh-in per day: logging the same date again replaces it. Only log a number the user actually gave you.' + writeNote,
  schema: {
    weight: z.number().min(20).max(700),
    date: z.string().regex(ISO).optional().describe('YYYY-MM-DD, not in the future. Defaults to today.')
  },
  handler: async params => {
    const out = await mutate(S => applyBodyweight(S, params))
    return { ...out.result, saved_rev: out.rev }
  }
}

/** Whether this server can write right now — surfaced so an assistant can say why not. */
export const planningStatus = {
  name: 'planning_status',
  description: 'Report whether this MCP server can change the profile (create routines, set the week) or only read it, and how to enable writing if it cannot. Call this once before planning if a write tool has not been used yet in the conversation.',
  schema: {},
  handler: () => (isRemote()
    ? { can_write: true, mode: 'paired with the openGym server — changes sync to every device' }
    : {
        can_write: false,
        mode: 'reading the data folder directly (read-only)',
        how_to_enable: 'In openGym (browser): Settings → "Pair the mobile app" shows a one-time code. Then in the mcp folder run: npm run pair -- <server-url> <code>  and restart this client.'
      })
}

export const PLAN_TOOLS = [
  planningStatus, searchExercisesTool, createRoutine, createPlan, updateRoutine, deleteRoutineTool, setWeekPlan, setDayOverride, logBodyweight
]
