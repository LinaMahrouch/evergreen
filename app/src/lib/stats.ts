// Numbers read back out of the workout log. The maths (1RM estimates, muscle load) is the
// engine's; this only walks the history and picks what a screen shows.
import { estimate1RM, isWarmupRow, type State } from '@/engine'

export interface Record1RM { id: string; est: number; w: number; r: number; d: string }

/** The best estimated one-rep max per exercise across the whole log, strongest first. */
export function records(S: State): Record1RM[] {
  const best = new Map<string, Record1RM>()
  for (const w of S.workouts) {
    for (const e of w.entries || []) {
      for (const s of e.sets || []) {
        // A warm-up row is not a record, however heavy the ramp got.
        if (!s.done || isWarmupRow(s)) continue
        const est = estimate1RM(Number(s.w), Number(s.r))
        if (est == null) continue
        const prev = best.get(e.id)
        if (!prev || est > prev.est) best.set(e.id, { id: e.id, est, w: Number(s.w), r: Math.round(Number(s.r)), d: w.d })
      }
    }
  }
  return [...best.values()].sort((a, b) => b.est - a.est)
}

/** Every logged session of one exercise, newest first. */
export function sessionsOf(S: State, exId: string) {
  const out: { d: string; sets: State['workouts'][number]['entries'][number]['sets']; target: unknown }[] = []
  for (let i = S.workouts.length - 1; i >= 0; i--) {
    const w = S.workouts[i]
    for (const e of w.entries || []) {
      if (e.id === exId && e.sets.some(s => s.done)) out.push({ d: w.d, sets: e.sets.filter(s => s.done), target: e.target })
    }
  }
  return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
}
