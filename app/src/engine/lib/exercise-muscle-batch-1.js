// VENDORED from openGym (frontend/src/lib/exercise-muscle-batch-1.js) — AGPL-3.0-or-later, © Duarte Santos.
// Do not edit here: change the source and run `npm run sync:engine`.
import batch from './exercise-muscle-batch-1.json'
import olympic from './exercise-muscle-olympic.json'
import { MACHINE_BATCH_2 } from './exercise-muscle-batch-2.js'

/**
 * ExRx-informed metadata for the first compound-lift batch. The raw generated catalogue remains
 * untouched; exercises.js applies this layer to the runtime index.
 */
export const COMPOUND_LIFT_BATCH_1 = Object.freeze(batch)
export const OLYMPIC_LIFT_METADATA = Object.freeze(olympic)

// Keep the phase-2 artifact in its own module for auditing while preserving the phase-1 resolver
// interface consumed by exercises.js and downstream muscle helpers.
export { MACHINE_BATCH_2 }

/**
 * Reserved for owner-approved corrections. This layer is intentionally separate from the
 * generated batch so a correction can replace a generated body part or muscle list without
 * editing generated data. Explicit metadata on a user/custom exercise wins as well.
 */
export const USER_EXERCISE_MUSCLE_OVERRIDES = Object.freeze({})

export function exerciseMuscleMetadataFor(id) {
  return {
    ...(COMPOUND_LIFT_BATCH_1[id] || {}),
    ...(MACHINE_BATCH_2[id] || {}),
    ...(OLYMPIC_LIFT_METADATA[id] || {}),
    ...(USER_EXERCISE_MUSCLE_OVERRIDES[id] || {})
  }
}
