// Choices about this device rather than the profile: they are not synced and not in a backup.
import { create } from 'zustand'
import { KEYS, readJson, writeJson } from './storage'

interface Saved { animations?: boolean }

interface Prefs {
  /** show the exercise animations and thumbnails (loaded from the network) */
  animations: boolean
  boot(): Promise<void>
  setAnimations(on: boolean): void
}

export const usePrefs = create<Prefs>(set => ({
  animations: true,
  async boot() {
    const saved = await readJson<Saved>(KEYS.prefs)
    if (saved && typeof saved.animations === 'boolean') set({ animations: saved.animations })
  },
  setAnimations(on) {
    set({ animations: on })
    void writeJson(KEYS.prefs, { animations: on } satisfies Saved)
  },
}))
