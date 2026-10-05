// Types for the engine facade (index.js). The shapes are openGym's state document: what the
// app keeps on the device is the same JSON an openGym server stores, field for field.

export type Unit = 'kg' | 'lb'
export type Mode = 'reps' | 'time' | 'cardio'
export type Policy = 'off' | 'linear' | 'greyskull' | 'double' | 'time'

export interface Exercise {
  id: string
  /** name, lower case */
  n: string
  /** body part */
  bp: string
  /** equipment */
  eq?: string
  /** target muscle */
  tg?: string
  sm?: string[]
  /** instruction steps */
  st?: string[]
  img?: string
  gif?: string
  primaries?: string[]
  secondaries?: string[]
  custom?: boolean
  desc?: string
  missing?: boolean
}

/** One exercise as a routine plans it. */
export interface Slot {
  id: string
  sets: number
  reps?: number
  repsMin?: number
  weight?: number
  sec?: number
  min?: number
  speed?: number
  mode?: Mode
  restSec?: number
  note?: string
  sg?: string
  prog?: Policy
  warmupSets?: number
  bodyweight?: boolean
  [key: string]: unknown
}

export interface Routine {
  id: string
  name: string
  emoji?: string
  prog?: Policy
  ex: Slot[]
  _ts?: number
}

export interface SetRow {
  w: number
  r: number
  done: boolean
  sec?: number
  min?: number
  speed?: number
  phase?: string
  type?: string
  [key: string]: unknown
}

export interface Prescription {
  policy: Policy
  kind: string
  weight?: number
  reps?: number
  sets?: number
  sec?: number
  /** [template, ...args] */
  why?: [string, ...unknown[]]
}

export interface Entry {
  id: string
  sets: SetRow[]
  target?: Slot | null
  plan?: Prescription
  planned?: unknown
  sg?: string
  rid?: string
  note?: string
  noProg?: boolean
  topW?: number | null
}

export interface Active {
  id: string
  d: string
  start: number
  routineIds: string[]
  name: string
  bw: number | null
  cur: number
  entries: Entry[]
  note?: string
}

export interface Workout {
  id: string
  d: string
  start: number
  end: number
  routineId: string | null
  routineIds?: string[]
  name: string
  bw: number | null
  entries: Entry[]
  prs: string[]
  vol?: number
  note?: string
  _ts?: number
}

export interface WeighIn { d: string; w: number; t?: number }

export interface State {
  unit: Unit
  restSec: number
  routines: Routine[]
  /** getDay() index → routine ids (a bare id in old profiles) */
  week: Record<string, string[] | string>
  /** iso date → routine id, or 'rest' */
  dayPlan: Record<string, string>
  workouts: Workout[]
  bodyweight: WeighIn[]
  exWeights: Record<string, { w: number; d: string }>
  customEx: Exercise[]
  targetW: number | null
  active: Active | null
  weekStart?: number
  _ts?: number
  _rev?: number
  [key: string]: unknown
}

/* ---------- exercises ---------- */
export const EXIDX: Record<string, Exercise>
export const CATALOGUE: Exercise[]
export const BODYPARTS: string[]
export function allExercises(S: Pick<State, 'customEx'>): Exercise[]
export function searchExercises(list: Exercise[], query: string): Exercise[]
export function registerCustom(list: Exercise[]): void
export function isCardio(idOrEx: string | Exercise): boolean
export function isBodyweightEq(idOrEx: string | Exercise): boolean
export function betterWeight(idOrEx: string | Exercise, a: number, b: number): number
export function beatsWeight(idOrEx: string | Exercise, w: number, prev: number): boolean
export function exOr(id: string): Exercise

/* ---------- history / plan ---------- */
export function modeOf(cfg: Partial<Slot> | null | undefined): Mode
export function defaultConfig(id: string, mode?: Mode): Pick<Slot, 'sets'> & Partial<Slot>
export function exLine(cfg: Partial<Slot>, unit: Unit): string
export function setLabel(id: string, set: Partial<SetRow>, cfg?: Partial<Slot>): string
export function fmtSec(sec: number): string
export function effectiveRoutines(S: State, iso: string): Routine[]
export function effectiveRoutineIds(S: State, iso: string): string[]
export function nextTrainingDay(S: State, iso: string): { iso: string; weekday: number; routines: Routine[]; routine: Routine } | null
export function workoutVolume(w: Pick<Workout, 'entries'>): number
export function setsDone(w: Pick<Workout, 'entries'>): number
export function bestWeightFor(S: State, exId: string): number
export function bestWeightForEntry(e: Entry): number
export function lastEntryFor(S: State, exId: string, routineId?: string | null): Entry | null
export function streakWeeks(S: State): number

/* ---------- format ---------- */
export function uid(): string
export function todayISO(): string
export function isoOf(d: Date): string
export const DAYN: string[]
export const DAYS: string[]
export const MONTHS: string[]
export function fmtDate(iso: string, short?: boolean): string
export function fmtNum(n: number): string
export function fmtDur(ms: number): string

/* ---------- session ---------- */
export function buildCombinedEntries(S: State, routineIds: string | string[] | null): { entries: Entry[]; routineIds: string[]; routines: Routine[] }
export function deriveSessionName(names: string[]): string | null
export function buildCompletedWorkout(active: Active, opts?: { end?: number; prs?: string[]; snapshotFor?: (e: Entry) => unknown }): Workout
export function isWarmupRow(set: Partial<SetRow>): boolean
export function hasCompletedWork(set: Partial<SetRow>): boolean

/* ---------- progression / stats ---------- */
export function policyFor(cfg: Partial<Slot> | null, routine: Partial<Routine> | null, mode?: Mode): Policy
export const POLICY_NAME: Record<Policy, string>
export const POLICY_DESC: Record<Policy, string>
export const POLICIES_FOR: Record<Mode, Policy[]>
export function weightIncrement(cfg: Partial<Slot>, unit: Unit): number
export function defaultIncrement(id: string, unit: Unit): number
export function estimate1RM(w: number, r: number, formula?: string): number | null
export function best1RM(S: State, exId: string, formula?: string): { est: number; w: number; r: number; d: string } | null
export function e1rmSeries(S: State, exId: string, formula?: string): { d: string; y: number; w: number; r: number }[]
export function is1RMRecord(S: State, exId: string, entry: Entry): { est: number; w: number; r: number } | null
export function loadOfWorkouts(workouts: Workout[]): Record<string, number>
export function rankOf(load: Record<string, number>): { worked: string[]; missed: string[] }
export function levelsOf(load: Record<string, number>): Record<string, number>
export const MUSCLE_NAME: Record<string, string>

/* ---------- sync / plan helpers ---------- */
export function mergeStates(a: State | null, b: State | null, opts?: { prefer?: 'a' | 'b' }): State
export function stampRoutines(prev: Routine[] | undefined, next: Routine[] | undefined, now?: number): Routine[]
export function stampCustomEx(prev: Exercise[] | undefined, next: Exercise[] | undefined, now?: number): Exercise[]
export function stampWorkout(w: Workout, now?: number): Workout
export function starterPlanOptions(): { id: string; days: number }[]
export function buildStarterPlan(id: string): { routines: Routine[]; schedule: { day: number; routineId: string }[] } | null
export function deleteRoutine(S: State, id: string): Record<string, string>
export function copyRoutine(routine: Routine, suffix?: string): Routine
export function convertStateUnit(S: State, to: Unit): State

/** The sets, target and prescription one planned exercise opens a session with. */
export function buildPlannedEntry(S: State, cfg: Slot, routine: Routine | null, opts?: { noProg?: boolean }): Omit<Entry, 'id'>
