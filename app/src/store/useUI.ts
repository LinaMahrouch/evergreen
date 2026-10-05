// State that belongs to the moment rather than the profile: the rest countdown, and where the
// exercise the picker returns should go. Never saved.
import { create } from 'zustand'

export type PickTarget =
  | { kind: 'routine'; routineId: string }
  | { kind: 'active' }

interface UI {
  rest: { endsAt: number; total: number } | null
  startRest(seconds: number): void
  addRest(seconds: number): void
  stopRest(): void
  pick: PickTarget | null
  setPick(target: PickTarget | null): void
}

export const useUI = create<UI>((set, get) => ({
  rest: null,
  startRest(seconds) {
    if (!(seconds > 0)) { set({ rest: null }); return }
    set({ rest: { endsAt: Date.now() + seconds * 1000, total: seconds } })
  },
  addRest(seconds) {
    const rest = get().rest
    if (!rest) return
    set({ rest: { endsAt: Math.max(Date.now(), rest.endsAt) + seconds * 1000, total: rest.total + seconds } })
  },
  stopRest() { set({ rest: null }) },
  pick: null,
  setPick(pick) { set({ pick }) },
}))
