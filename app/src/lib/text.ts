// How things read. The exercise names in the library are lower case; everything the app shows
// goes through here so a name, a set and a date look the same on every screen.
import {
  DAYN, MONTHS, exOr, fmtNum, fmtSec, isWarmupRow, modeOf, setLabel,
  type Entry, type Exercise, type Prescription, type SetRow, type Slot, type State, type Unit, type Workout,
} from '@/engine'

export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** The exercise behind an id: the user's own first, then the library. */
export function exerciseOf(S: Pick<State, 'customEx'>, id: string): Exercise {
  return S.customEx.find(e => e.id === id) || exOr(id)
}
export const exName = (S: Pick<State, 'customEx'>, id: string) => cap(exerciseOf(S, id).n)

const dateOf = (iso: string) => new Date(iso + 'T12:00:00')

/** "Monday · 5 Oct" */
export function longDate(iso: string): string {
  const d = dateOf(iso)
  return `${DAYN[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "5 Oct" this year, "5 Oct 2025" otherwise */
export function shortDate(iso: string): string {
  const d = dateOf(iso)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** "1:05:09" or "5:09" from milliseconds */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

/** "48 min" or "1 h 12 min" */
export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

export const weight = (w: number, unit: Unit) => `${fmtNum(w)} ${unit}`

/** What a session entry opens with, in one line: "4 × 8 · 60 kg", "3 × 0:45", "20 min". */
export function entrySummary(e: Entry, unit: Unit): string {
  const work = e.sets.filter(s => !isWarmupRow(s))
  const first = work[0]
  if (!first) return ''
  const mode = modeOf({ ...(e.target || {}), id: e.id })
  if (mode === 'cardio') return `${first.min || 0} min`
  if (mode === 'time') return `${work.length} × ${fmtSec(Number(first.sec) || 0)}`
  const load = Number(first.w) > 0 ? ` · ${weight(Number(first.w), unit)}` : ''
  return `${work.length} × ${first.r}${load}`
}

/** One logged set as it reads in a list: "60 kg × 8", "12 reps", "0:45", "20 min @ 8 km/h". */
export function setText(unit: Unit, id: string, set: SetRow, target?: Slot | null): string {
  const cfg = { ...(target || {}), id }
  if (modeOf(cfg) === 'reps') {
    const w = Number(set.w) || 0
    const r = Math.round(Number(set.r) || 0)
    return w > 0 ? `${weight(w, unit)} × ${r}` : `${r} ${r === 1 ? 'rep' : 'reps'}`
  }
  // Timed holds and cardio already read well the way the engine words them.
  return setLabel(id, { ...set, done: undefined }, cfg)
}

/** The progression rule's own sentence for why today's number is what it is. */
export function whyOf(plan: Prescription | undefined): string | null {
  if (!plan || !plan.why) return null
  const [template, ...args] = plan.why
  let out = String(template)
  args.forEach((a, i) => { out = out.split(`{${i}}`).join(String(a)) })
  return out
}

/** "3,240 kg" */
export function volume(v: number, unit: Unit): string {
  return `${Math.round(v).toLocaleString('en-US')} ${unit}`
}

export function workoutLine(w: Workout, unit: Unit, sets: number): string {
  const parts = [shortDate(w.d)]
  if (w.end && w.start) parts.push(duration(w.end - w.start))
  parts.push(`${sets} sets`)
  if (w.vol) parts.push(volume(w.vol, unit))
  return parts.join(' · ')
}
