import * as Haptics from 'expo-haptics'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, TextInput, Vibration, View } from 'react-native'
import { fmtNum, isWarmupRow, modeOf, type Active, type Entry, type Mode, type SetRow } from '@/engine'
import { clock, exName, exerciseOf, whyOf } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { Btn, C, Empty, Icon, Line, Link, SP, Screen, Txt, confirm, notify, parseNum } from '@/ui'
import { ExerciseMedia } from '@/ui/ExerciseMedia'

const KEEP_AWAKE = 'evergreen-workout'

/** Re-renders twice a second while mounted, for the clocks. */
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  return now
}

const buzz = () => { if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }

/** A number in a set row. Shows the value; while focused it is whatever is being typed. */
function Cell({ value, onChange, label, done, whole }: { value: number; onChange: (v: number) => void; label: string; done: boolean; whole?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <TextInput
      value={draft ?? (value ? fmtNum(value) : '')}
      placeholder="0"
      placeholderTextColor={C.faint}
      selectionColor={C.white}
      keyboardType={whole ? 'number-pad' : 'decimal-pad'}
      selectTextOnFocus
      maxLength={7}
      onFocus={() => setDraft(value ? String(value) : '')}
      onBlur={() => setDraft(null)}
      onChangeText={text => {
        setDraft(text)
        if (text.trim() === '') { onChange(0); return }
        const n = parseNum(text)
        if (n != null && n >= 0) onChange(whole ? Math.round(n) : n)
      }}
      accessibilityLabel={label}
      style={[styles.cell, done && { color: C.dim }]}
    />
  )
}

function Check({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      style={[styles.check, done && { backgroundColor: C.green, borderColor: C.green }]}
    >
      {done ? <Icon name="check" size={20} /> : null}
    </Pressable>
  )
}

function ExerciseBlock({ entry, index, unit }: { entry: Entry; index: number; unit: string }) {
  const S = useStore(s => s.S)
  const editActive = useStore(s => s.editActive)
  const mode: Mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const name = exName(S, entry.id)
  const why = whyOf(entry.plan)

  const editRow = (row: number, mut: (s: SetRow, all: SetRow[]) => void) =>
    editActive(a => { const sets = a.entries[index]?.sets; if (sets?.[row]) mut(sets[row], sets) })

  const setWeight = (row: number, w: number) => editRow(row, (s, all) => {
    const before = s.w
    s.w = w
    // The sets after this one that were waiting at the same weight follow it: changing the
    // first set to 62.5 should not mean typing 62.5 four more times.
    if (isWarmupRow(s)) return
    for (let i = row + 1; i < all.length; i++) {
      if (!all[i].done && !isWarmupRow(all[i]) && all[i].w === before) all[i].w = w
    }
  })

  const toggle = (row: number) => {
    const wasDone = entry.sets[row].done
    editRow(row, s => { s.done = !s.done })
    if (wasDone) return
    buzz()
    const rest = Number(entry.target?.restSec) > 0 ? Number(entry.target?.restSec) : S.restSec
    useUI.getState().startRest(rest)
  }

  const addSet = () => editActive(a => {
    const sets = a.entries[index].sets
    const last = [...sets].reverse().find(s => !isWarmupRow(s)) || sets[sets.length - 1]
    const row: SetRow = last
      ? { ...last, done: false }
      : mode === 'cardio' ? { w: 0, r: 0, min: 20, speed: 8, done: false }
        : mode === 'time' ? { w: 0, r: 0, sec: 45, done: false }
          : { w: 0, r: 10, done: false }
    delete row.phase
    sets.push(row)
  })

  const removeSet = () => editActive(a => { a.entries[index].sets.pop() })

  const removeExercise = async () => {
    if (!(await confirm(`Remove ${name}?`, 'It comes out of this workout only.', 'Remove'))) return
    editActive(a => { a.entries.splice(index, 1) })
  }

  let workNumber = 0
  return (
    <View style={styles.block}>
      <Pressable onPress={() => router.push(`/exercise/${entry.id}`)} accessibilityRole="button" accessibilityLabel={`${name}. How to do it.`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
          <ExerciseMedia ex={exerciseOf(S, entry.id)} kind="still" size={48} />
          <Txt variant="heading" style={{ flex: 1 }}>{name}</Txt>
        </View>
      </Pressable>
      {why ? <Txt variant="label" dim style={{ marginTop: 2, fontWeight: '400' }}>{why}</Txt> : null}
      {entry.target?.note ? <Txt variant="label" dim style={{ marginTop: 2, fontWeight: '400' }}>{String(entry.target.note)}</Txt> : null}

      <View style={styles.head}>
        <Txt variant="caption" faint style={styles.colSet}>Set</Txt>
        {mode === 'reps' ? (
          <>
            <Txt variant="caption" faint style={styles.colNum}>{unit}</Txt>
            <Txt variant="caption" faint style={styles.colNum}>Reps</Txt>
          </>
        ) : mode === 'time' ? (
          <Txt variant="caption" faint style={styles.colNum}>Seconds</Txt>
        ) : (
          <>
            <Txt variant="caption" faint style={styles.colNum}>Min</Txt>
            <Txt variant="caption" faint style={styles.colNum}>km/h</Txt>
          </>
        )}
        <View style={styles.colCheck} />
      </View>

      {entry.sets.map((s, row) => {
        const warm = isWarmupRow(s)
        if (!warm) workNumber++
        const label = warm ? 'W' : String(workNumber)
        const spoken = warm ? `Warm-up set of ${name}` : `Set ${workNumber} of ${name}`
        return (
          <View key={row} style={styles.setRow}>
            <Txt variant="num" style={[styles.colSet, { color: s.done ? C.dim : warm ? C.faint : C.white, fontSize: 17 }]}>{label}</Txt>
            {mode === 'reps' ? (
              <>
                <View style={styles.colNum}><Cell value={Number(s.w) || 0} done={s.done} label={`${spoken}, weight`} onChange={w => setWeight(row, w)} /></View>
                <View style={styles.colNum}><Cell value={Number(s.r) || 0} done={s.done} whole label={`${spoken}, reps`} onChange={r => editRow(row, x => { x.r = r })} /></View>
              </>
            ) : mode === 'time' ? (
              <View style={styles.colNum}><Cell value={Number(s.sec) || 0} done={s.done} whole label={`${spoken}, seconds`} onChange={sec => editRow(row, x => { x.sec = sec })} /></View>
            ) : (
              <>
                <View style={styles.colNum}><Cell value={Number(s.min) || 0} done={s.done} label={`${spoken}, minutes`} onChange={min => editRow(row, x => { x.min = min })} /></View>
                <View style={styles.colNum}><Cell value={Number(s.speed) || 0} done={s.done} label={`${spoken}, speed`} onChange={speed => editRow(row, x => { x.speed = speed })} /></View>
              </>
            )}
            <View style={styles.colCheck}><Check done={s.done} onPress={() => toggle(row)} label={`${spoken}, done`} /></View>
          </View>
        )
      })}

      <View style={styles.actions}>
        <Link label="Add set" onPress={addSet} />
        {entry.sets.length > 1 ? <Link label="Remove set" onPress={removeSet} /> : null}
        <View style={{ flex: 1 }} />
        <Link label="Remove" onPress={removeExercise} />
      </View>
    </View>
  )
}

function Footer({ active, now, onFinish }: { active: Active; now: number; onFinish: () => void }) {
  const rest = useUI(s => s.rest)
  const total = active.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = active.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
  const left = rest ? rest.endsAt - now : 0

  useEffect(() => {
    if (rest && left <= 0) {
      if (Platform.OS !== 'web') Vibration.vibrate(500)
      useUI.getState().stopRest()
    }
  }, [rest, left])

  if (rest && left > 0) {
    return (
      <View style={styles.restBar}>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" dim>Rest</Txt>
          <Txt variant="display" style={{ fontVariant: ['tabular-nums'] }}>{clock(left + 999)}</Txt>
        </View>
        <Btn small kind="outline" label="+15 s" onPress={() => useUI.getState().addRest(15)} />
        <Btn small kind="outline" label="Skip" onPress={() => useUI.getState().stopRest()} />
      </View>
    )
  }
  return (
    <Btn
      label={total && done >= total ? 'Finish workout' : `Finish  ·  ${done} of ${total} sets`}
      kind={total && done >= total ? 'primary' : 'outline'}
      onPress={onFinish}
    />
  )
}

export default function Workout() {
  const active = useStore(s => s.active)
  const unit = useStore(s => s.S.unit)
  const now = useNow()

  useEffect(() => {
    if (Platform.OS === 'web') return
    void activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {})
    return () => { void deactivateKeepAwake(KEEP_AWAKE).catch(() => {}) }
  }, [])

  if (!active) {
    return (
      <Screen>
        <Empty title="No workout in progress.">
          <Btn label="Back to today" kind="outline" onPress={() => router.dismissTo('/')} />
        </Empty>
      </Screen>
    )
  }

  const finish = async () => {
    const total = active.entries.reduce((n, e) => n + e.sets.length, 0)
    const done = active.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)
    if (!done) {
      if (!(await confirm('Nothing checked off', 'No sets are marked done, so there is nothing to save. End this workout?', 'End it'))) return
    } else if (done < total) {
      const left = total - done
      if (!(await confirm('Finish early?', `${left} ${left === 1 ? 'set is' : 'sets are'} still unchecked. Only the sets you checked off are saved.`, 'Finish'))) return
    }
    useUI.getState().stopRest()
    const result = useStore.getState().finishWorkout()
    if (!result) { router.dismissTo('/'); return }
    router.replace(`/summary?id=${result.workout.id}`)
  }

  const discard = async () => {
    if (!(await confirm('Discard this workout?', 'Everything logged in it is thrown away.', 'Discard'))) return
    useUI.getState().stopRest()
    useStore.getState().discardWorkout()
    router.dismissTo('/')
  }

  const addExercise = () => {
    useUI.getState().setPick({ kind: 'active' })
    router.push('/pick')
  }

  return (
    <Screen footer={<Footer active={active} now={now} onFinish={finish} />}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Minimise workout">
          <Icon name="down" />
        </Pressable>
        <Txt variant="num" style={{ fontSize: 17 }}>{clock(now - active.start)}</Txt>
        <View style={{ width: 22 }} />
      </View>

      <Txt variant="title" style={{ marginTop: SP.sm }}>{active.name}</Txt>

      {active.entries.map((entry, i) => <ExerciseBlock key={`${entry.id}-${i}`} entry={entry} index={i} unit={unit} />)}

      {!active.entries.length ? (
        <Txt dim style={{ marginTop: SP.xl }}>An empty session. Add the exercises as you go.</Txt>
      ) : null}

      <View style={{ marginTop: SP.xxl, gap: SP.xl }}>
        <Btn label="Add exercise" kind="outline" icon="plus" onPress={addExercise} />
        <View style={{ alignItems: 'center' }}><Link label="Discard workout" onPress={discard} /></View>
      </View>
      <Line />
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  block: { marginTop: SP.xxl },
  head: { flexDirection: 'row', alignItems: 'center', marginTop: SP.md, paddingBottom: SP.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  setRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  colSet: { width: 44 },
  colNum: { flex: 1, textAlign: 'left' },
  colCheck: { width: 44, alignItems: 'flex-end' },
  cell: {
    color: C.white, fontSize: 22, fontWeight: '600', height: 48, paddingVertical: 0, paddingRight: SP.sm,
    fontVariant: ['tabular-nums'], outlineStyle: 'none',
  } as any,
  check: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.75, borderColor: C.dim, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: SP.xl, alignItems: 'center', minHeight: 44 },
  restBar: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
})
