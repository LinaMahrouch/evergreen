// What the coach can look at and change. The writes are the very functions the MCP server
// runs for an outside assistant (engine lib/plan-apply.js); here they are applied to the
// profile on this device, and reach a paired server through the ordinary sync.
import {
  BODYPARTS, KNOWN_GLYPHS, WEEKDAYS, applyBodyweight, applyDayOverride, applyDeleteRoutine, applyPlan,
  applyUpdateRoutine, applyWeekPlan, best1RM, findExercises, isWarmupRow, isoOf, loadOfWorkouts, rankOf,
  routineView, todayISO, weekView, MUSCLE_NAME,
  type SetRow, type State,
} from '@/engine'
import { exName, longDate } from '@/lib/text'
import { sessionsOf } from '@/lib/stats'
import { useStore } from '@/store/useStore'

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }

/** What a tool call did, for the line the chat shows under the coach's words. */
export interface ToolOutcome {
  /** JSON handed back to the model */
  result: unknown
  failed: boolean
  /** set when the profile changed: a short line for the person ("Created Push A") */
  changed?: string
}

const slot = {
  type: 'object',
  properties: {
    exercise_id: { type: 'string', description: 'An id from search_exercises (e.g. "0025" is the barbell bench press).' },
    sets: { type: 'integer', minimum: 1, maximum: 20, description: 'Work sets. Default 3 (1 for cardio).' },
    reps: { type: 'integer', minimum: 1, maximum: 200, description: 'Target reps per set. With reps_min this is the TOP of the range. Default 10.' },
    reps_min: { type: 'integer', minimum: 1, maximum: 200, description: 'Bottom of a rep range ("8–12" is reps_min 8, reps 12).' },
    weight: { type: 'number', minimum: 0, maximum: 2000, description: 'Starting load in the profile unit. Omit to let the app carry the weight over from the last session; for a bodyweight exercise it is ADDED weight.' },
    seconds: { type: 'integer', minimum: 1, maximum: 7200, description: 'Makes it a timed hold (plank, hang, carry): seconds per set instead of reps.' },
    minutes: { type: 'number', minimum: 1, maximum: 600, description: 'Cardio only: minutes per bout.' },
    speed_kmh: { type: 'number', minimum: 0.1, maximum: 100, description: 'Cardio only: speed in km/h.' },
    rest_sec: { type: 'integer', minimum: 0, maximum: 1800, description: 'Rest after each set. Omit to use the default rest timer.' },
    note: { type: 'string', maxLength: 400, description: 'A cue shown with the exercise ("pause at the bottom").' },
  },
  required: ['exercise_id'],
}

const routineProps = {
  name: { type: 'string', minLength: 1, maxLength: 60 },
  icon: { type: 'string', enum: KNOWN_GLYPHS },
  progression: {
    type: 'string', enum: ['off', 'linear', 'greyskull', 'double'],
    description: 'How load is added over time. linear: add weight each session all reps were hit. double: add reps through a range, then weight. greyskull: linear with an AMRAP last set. off: targets stay put. Default linear.',
  },
}

const weekdayMap = (items: Record<string, unknown>) => ({
  type: 'object',
  properties: Object.fromEntries(WEEKDAYS.map(d => [d, { type: 'array', maxItems: 4, items }])),
  additionalProperties: false,
})

export const TOOLS: ToolDef[] = [
  {
    name: 'search_exercises',
    description: 'Search the exercise library (1,300+ exercises plus the user\'s own) by name, optionally narrowed by body part or equipment. Returns exercise ids: every planning tool needs ids, never names. Search before creating or editing a routine. Tolerates typos.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the exercise name, e.g. "incline dumbbell press", "pull up", "plank".' },
        body_part: { type: 'string', enum: BODYPARTS },
        equipment: { type: 'string', description: 'e.g. "barbell", "dumbbell", "cable", "body weight", "kettlebell", "leverage machine", "band".' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 10.' },
      },
    },
  },
  {
    name: 'get_training_log',
    description: 'The logged workouts of the last N days, newest first: date, name, minutes, and each exercise with the sets actually done. Also which muscles were worked and missed in that window.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 365, description: 'Default 30.' } } },
  },
  {
    name: 'get_exercise_history',
    description: 'Every logged session of one exercise, newest first, with the sets done and the best estimated one-rep max.',
    input_schema: { type: 'object', properties: { exercise_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 40, description: 'Default 10.' } }, required: ['exercise_id'] },
  },
  {
    name: 'create_plan',
    description: 'Create a whole training plan in one step: several routines plus the weekdays they fall on. Each routine gets a `key` you choose ("push", "legs-a"), and `schedule` maps weekday names to those keys. Days you list are (re)assigned; days you leave out keep what they have unless replace_week is true, which turns every unlisted day into a rest day. Existing routines are never overwritten or deleted: the new ones are added beside them.',
    input_schema: {
      type: 'object',
      properties: {
        routines: {
          type: 'array', minItems: 1, maxItems: 14,
          items: {
            type: 'object',
            properties: { key: { type: 'string', description: 'Your handle for this routine inside this call, used by `schedule`.' }, ...routineProps, exercises: { type: 'array', minItems: 1, maxItems: 30, items: slot } },
            required: ['key', 'name', 'exercises'],
          },
        },
        schedule: { ...weekdayMap({ type: 'string' }), description: 'Weekday → routine keys, e.g. {"monday": ["push"], "wednesday": ["pull"]}.' },
        replace_week: { type: 'boolean', description: 'true: the week becomes exactly `schedule`; every day not listed turns into a rest day. Default false.' },
      },
      required: ['routines'],
    },
  },
  {
    name: 'create_routine',
    description: 'Create one new routine: a named list of exercises with set and rep targets. It is added beside the existing ones and is NOT on a weekday until set_week_plan puts it there.',
    input_schema: { type: 'object', properties: { ...routineProps, exercises: { type: 'array', minItems: 1, maxItems: 30, items: slot } }, required: ['name', 'exercises'] },
  },
  {
    name: 'update_routine',
    description: 'Change an existing routine in place: its name, icon, progression rule and/or its exercises. `exercises`, when given, REPLACES the whole list in the order given: send back every exercise you want to keep; one you leave out is removed. For an exercise that stays, a field you omit keeps its current value (so {exercise_id, sets: 4} only changes the set count). The routine keeps its id, its weekdays and its history.',
    input_schema: {
      type: 'object',
      properties: { routine_id: { type: 'string' }, ...routineProps, exercises: { type: 'array', minItems: 1, maxItems: 30, items: slot } },
      required: ['routine_id'],
    },
  },
  {
    name: 'delete_routine',
    description: 'Delete a routine. Logged workouts are kept; it is taken off every weekday. Only when the user asked for it: to stop using a routine without losing it, take it off the week with set_week_plan instead.',
    input_schema: {
      type: 'object',
      properties: { routine_id: { type: 'string' }, confirm_name: { type: 'string', description: 'The exact name of the routine, as a guard against deleting the wrong one.' } },
      required: ['routine_id', 'confirm_name'],
    },
  },
  {
    name: 'set_week_plan',
    description: 'Put routines on weekdays. `days` maps weekday names to lists of routine ids: one id is a normal training day, two make a combined session, an empty list makes that day a rest day. Days you do not mention are left as they are, unless replace_week is true.',
    input_schema: {
      type: 'object',
      properties: { days: weekdayMap({ type: 'string' }), replace_week: { type: 'boolean', description: 'true: every weekday not listed becomes a rest day.' } },
      required: ['days'],
    },
  },
  {
    name: 'set_day_override',
    description: 'Change what is planned on ONE calendar date without touching the weekly plan: train a different routine that day (routine_id), make it a rest day (rest: true), or remove an earlier override (clear: true). "Move Thursday to Friday" is two calls, one per date.',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, routine_id: { type: 'string' }, rest: { type: 'boolean' }, clear: { type: 'boolean' } },
      required: ['date'],
    },
  },
  {
    name: 'log_bodyweight',
    description: 'Log a body-weight weigh-in in the profile\'s unit. One per day: the same date again replaces it. Only log a number the user actually gave you.',
    input_schema: {
      type: 'object',
      properties: { weight: { type: 'number', minimum: 20, maximum: 700 }, date: { type: 'string', description: 'YYYY-MM-DD, not in the future. Defaults to today.' } },
      required: ['weight'],
    },
  },
]

const ISO = /^\d{4}-\d{2}-\d{2}$/
const fail = (message: string): never => { throw new Error(message) }

const setLine = (s: SetRow, unit: string) => {
  if (s.min) return `${s.min} min${s.speed ? ` @ ${s.speed} km/h` : ''}`
  if (s.sec) return `${s.sec} s${Number(s.w) > 0 ? ` +${s.w} ${unit}` : ''}`
  return `${Number(s.w) > 0 ? s.w + ' ' + unit + ' × ' : ''}${s.r}`
}

function trainingLog(S: State, days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const from = isoOf(since)
  const inWindow = S.workouts.filter(w => w.d >= from)
  const load = loadOfWorkouts(inWindow)
  const { worked, missed } = rankOf(load)
  const name = (m: string) => MUSCLE_NAME[m] || m
  return {
    days,
    workouts_logged: inWindow.length,
    unit: S.unit,
    // Newest first, and not without end: a year of training would not fit in one answer.
    workouts: inWindow.slice().sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 40).map(w => ({
      date: w.d,
      name: w.name,
      minutes: w.end && w.start ? Math.round((w.end - w.start) / 60000) : null,
      exercises: (w.entries || []).map(e => ({
        id: e.id,
        name: exName(S, e.id),
        sets: e.sets.filter(s => s.done && !isWarmupRow(s)).map(s => setLine(s, S.unit)),
      })).filter(e => e.sets.length),
    })),
    muscles_worked_most: worked.slice(0, 8).map(name),
    muscles_missed: missed.map(name),
  }
}

function exerciseHistory(S: State, id: string, limit: number) {
  const sessions = sessionsOf(S, id)
  const best = best1RM(S, id)
  return {
    id,
    name: exName(S, id),
    unit: S.unit,
    sessions_logged: sessions.length,
    best_estimated_1rm: best ? { estimate: Math.round(best.est * 10) / 10, from: `${best.w} ${S.unit} × ${best.r}`, date: best.d } : null,
    sessions: sessions.slice(0, limit).map(s => ({ date: s.d, sets: s.sets.filter(x => !isWarmupRow(x)).map(x => setLine(x, S.unit)) })),
  }
}

/** A write: tried on a copy first, so a request the engine refuses leaves the profile untouched. */
function write<T>(apply: (S: State) => T): T {
  const store = useStore.getState()
  apply(JSON.parse(JSON.stringify(store.S)) as State)
  let out!: T
  store.update(s => { out = apply(s) })
  return out
}

const names = (list: { name: string }[]) => list.map(r => r.name).join(', ')

export function runTool(name: string, raw: unknown): ToolOutcome {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  try {
    const S = useStore.getState().S
    switch (name) {
      case 'search_exercises':
        return { result: findExercises(S, { ...input, limit: Math.min(30, Number(input.limit) || 10) }), failed: false }
      case 'get_training_log':
        return { result: trainingLog(S, Math.min(365, Math.max(1, Number(input.days) || 30))), failed: false }
      case 'get_exercise_history':
        if (typeof input.exercise_id !== 'string') fail('exercise_id is required')
        return { result: exerciseHistory(S, input.exercise_id, Math.min(40, Number(input.limit) || 10)), failed: false }
      case 'create_plan': {
        if (!Array.isArray(input.routines)) fail('routines is required')
        for (const r of input.routines) if (!r || typeof r.name !== 'string' || !Array.isArray(r.exercises) || !r.exercises.length) fail('every routine needs a name and at least one exercise')
        const result = write(s => applyPlan(s, input))
        return { result, failed: false, changed: `Created ${names(result.created)}${input.schedule ? ' and set the week' : ''}` }
      }
      case 'create_routine': {
        if (typeof input.name !== 'string' || !Array.isArray(input.exercises) || !input.exercises.length) fail('a routine needs a name and at least one exercise')
        const result = write(s => applyPlan(s, { routines: [{ ...input, key: 'r' }], schedule: {} }))
        return { result: { created: result.created[0], unit: result.unit }, failed: false, changed: `Created ${names(result.created)}` }
      }
      case 'update_routine': {
        if (input.name == null && input.icon == null && input.progression == null && input.exercises == null) fail('nothing to change: give at least one of name, icon, progression, exercises')
        const result = write(s => applyUpdateRoutine(s, input))
        return { result, failed: false, changed: `Changed ${result.updated.name}` }
      }
      case 'delete_routine': {
        const result = write(s => applyDeleteRoutine(s, input))
        return { result, failed: false, changed: `Deleted ${result.deleted.name}` }
      }
      case 'set_week_plan': {
        if (!input.days || typeof input.days !== 'object') fail('days is required')
        for (const ids of Object.values(input.days)) if (!Array.isArray(ids)) fail('each weekday maps to a list of routine ids (an empty list for a rest day)')
        const result = write(s => applyWeekPlan(s, input))
        return { result, failed: false, changed: 'Changed the week' }
      }
      case 'set_day_override': {
        if (typeof input.date !== 'string' || !ISO.test(input.date)) fail('date must be YYYY-MM-DD')
        const result = write(s => applyDayOverride(s, input))
        return { result, failed: false, changed: `Changed the plan for ${input.date === todayISO() ? 'today' : longDate(input.date)}` }
      }
      case 'log_bodyweight': {
        const w = Number(input.weight)
        if (!(w >= 20 && w <= 700)) fail('weight must be between 20 and 700')
        if (input.date != null && !ISO.test(String(input.date))) fail('date must be YYYY-MM-DD')
        const result = write(s => applyBodyweight(s, { weight: w, date: input.date }))
        return { result, failed: false, changed: `Logged ${result.weight} ${result.unit}` }
      }
      default:
        return { result: { error: `unknown tool ${name}` }, failed: true }
    }
  } catch (e) {
    return { result: { error: e instanceof Error ? e.message : String(e) }, failed: true }
  }
}

/** The profile as the coach sees it at the start of every turn. */
export function snapshot(S: State) {
  const today = todayISO()
  const overrides = Object.entries(S.dayPlan || {}).filter(([d]) => d >= today).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, 14)
  const recent = S.workouts.slice().sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 8)
  const lastWeigh = S.bodyweight.length ? S.bodyweight[S.bodyweight.length - 1] : null
  return {
    today,
    weekday: WEEKDAYS[new Date().getDay()],
    unit: S.unit,
    routines: S.routines.map(r => routineView(r, S)),
    week: weekView(S),
    one_day_overrides: Object.fromEntries(overrides.map(([d, v]) => [d, v === 'rest' ? 'rest' : S.routines.find(r => r.id === v)?.name || v])),
    workouts_logged_in_total: S.workouts.length,
    most_recent_workouts: recent.map(w => ({ date: w.d, name: w.name })),
    body_weight: lastWeigh ? { latest: lastWeigh.w, date: lastWeigh.d, goal: S.targetW || null } : null,
  }
}
