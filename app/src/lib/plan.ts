import type { Routine, State } from '@/engine'

/** The weekdays in the order the profile's week runs: Monday first unless it says Sunday. */
export const weekOrder = (S: State) => (Number(S.weekStart) === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0])

/** The routines on a weekday, in session order. A bare id from an old profile reads as a list of one. */
export const routinesOn = (S: State, day: number): Routine[] =>
  ([] as string[]).concat(S.week[day] || [])
    .map(id => S.routines.find(r => r.id === id))
    .filter((r): r is Routine => !!r)

export const countLabel = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)
