// The app's one door into openGym's training logic (src/engine/lib, vendored by
// scripts/sync-engine.mjs). Screens import from here, never from lib/ directly, so the list of
// what the app depends on is this file. Types live beside it in index.d.ts.

export {
  EXIDX, CATALOGUE, BODYPARTS, allExercises, searchExercises, registerCustom,
  isCardio, isBodyweightEq, betterWeight, beatsWeight, exOr
} from './lib/exercises.js'

export {
  modeOf, defaultConfig, exLine, setLabel, fmtSec,
  effectiveRoutines, effectiveRoutineIds, nextTrainingDay,
  workoutVolume, setsDone, bestWeightFor, bestWeightForEntry, lastEntryFor, streakWeeks
} from './lib/history.js'

export { uid, todayISO, isoOf, DAYN, DAYS, MONTHS, fmtDate, fmtNum, fmtDur } from './lib/format.js'

export { buildCombinedEntries, deriveSessionName } from './lib/session-merge.js'
export { buildCompletedWorkout } from './lib/finish-workout.js'
export { isWarmupRow, hasCompletedWork } from './lib/workout-model.js'

export { policyFor, POLICY_NAME, POLICY_DESC, POLICIES_FOR, weightIncrement, defaultIncrement } from './lib/progression.js'
export { estimate1RM, best1RM, e1rmSeries, is1RMRecord } from './lib/onerm.js'
export { loadOfWorkouts, rankOf, levelsOf, MUSCLE_NAME } from './lib/muscles.js'

export { mergeStates, stampRoutines, stampCustomEx, stampWorkout } from './lib/sync-merge.js'
export { starterPlanOptions, buildStarterPlan } from './lib/starter.js'
export { deleteRoutine, copyRoutine } from './lib/routines.js'
export { convertStateUnit } from './lib/units.js'
export { buildPlannedEntry } from './lib/session-start.js'

// What the built-in coach may do to the plan — the same functions the MCP server runs.
export {
  KNOWN_GLYPHS, WEEKDAYS, findExercises, routineView, weekView,
  applyPlan, applyUpdateRoutine, applyDeleteRoutine, applyWeekPlan, applyDayOverride, applyBodyweight
} from './lib/plan-apply.js'
