/* The planning tools: one more read (search_exercises) and the writes an assistant needs to
   plan training — create or edit a routine, lay out the week, move one day, log a weigh-in.

   What each write does to the profile lives in the app's own lib (lib/plan-apply.js), as pure
   functions over a draft; the Evergreen app's built-in coach runs the same ones. Here they are
   handed to state.js `mutate`, which saves the draft through the api's conditional PUT. So a
   write either lands whole on top of the current document or not at all, and a tool that
   rejects its input rejects it before anything is saved. */
import { z } from 'zod'
import { getState, mutate, isRemote } from './state.js'
import { BODYPARTS } from '../../frontend/src/lib/exercises.js'
import { MAX_PLANNED_WARMUPS } from '../../frontend/src/lib/history.js'
import {
  KNOWN_GLYPHS, WEEKDAYS, findExercises,
  applyPlan, applyUpdateRoutine, applyDeleteRoutine, applyWeekPlan, applyDayOverride, applyBodyweight
} from '../../frontend/src/lib/plan-apply.js'

export {
  slotToConfig, applyPlan, applyUpdateRoutine, applyDeleteRoutine, applyWeekPlan, applyDayOverride, applyBodyweight
} from '../../frontend/src/lib/plan-apply.js'

const fail = (code, message) => { const e = new Error(message); e.code = code; throw e }

const ISO = /^\d{4}-\d{2}-\d{2}$/

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
  handler: params => findExercises(getState(), params)
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
