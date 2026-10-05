import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { POLICY_DESC, copyRoutine, deleteRoutine, exLine, policyFor, type Policy, type Routine } from '@/engine'
import { exName } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { Btn, C, Empty, Icon, IconBtn, Line, Link, SP, Screen, Section, Segmented, TopBar, Txt, confirm } from '@/ui'

const RULES: { value: Policy; label: string }[] = [
  { value: 'linear', label: 'Add weight' },
  { value: 'double', label: 'Add reps' },
  { value: 'off', label: 'Off' },
]

export default function RoutineEdit() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const S = useStore(s => s.S)
  const active = useStore(s => s.active)
  const update = useStore(s => s.update)
  const startWorkout = useStore(s => s.startWorkout)
  const routine = S.routines.find(r => r.id === id)

  if (!routine) {
    return <Screen><TopBar /><Empty title="This routine is gone." body="It may have been deleted on another device." /></Screen>
  }

  const edit = (mut: (r: Routine) => void) => update(s => { const r = s.routines.find(x => x.id === id); if (r) mut(r) })
  const move = (from: number, by: number) => edit(r => {
    const to = from + by
    if (to < 0 || to >= r.ex.length) return
    const [slot] = r.ex.splice(from, 1)
    r.ex.splice(to, 0, slot)
  })

  const remove = async () => {
    if (!(await confirm(`Delete “${routine.name}”?`, 'Workouts you logged with it are kept. It comes off every day it was planned on.', 'Delete'))) return
    router.back()
    update(s => { deleteRoutine(s, routine.id) })
  }

  const duplicate = () => {
    const copy = copyRoutine(routine)
    update(s => { s.routines.push(copy) })
    router.replace(`/routine/${copy.id}`)
  }

  const addExercise = () => {
    useUI.getState().setPick({ kind: 'routine', routineId: routine.id })
    router.push('/pick')
  }

  const rule = policyFor(null, routine, 'reps')

  return (
    <Screen
      footer={!active && routine.ex.length ? (
        <Btn label="Start this routine" onPress={() => { startWorkout([routine.id]); router.push('/workout') }} />
      ) : undefined}
    >
      <TopBar right={<IconBtn name="trash" label="Delete routine" onPress={remove} color={C.dim} />} />

      <TextInput
        value={routine.name}
        onChangeText={name => edit(r => { r.name = name })}
        onBlur={() => { if (!routine.name.trim()) edit(r => { r.name = 'Routine' }) }}
        placeholder="Routine name"
        placeholderTextColor={C.faint}
        selectionColor={C.white}
        maxLength={60}
        style={styles.name}
        accessibilityLabel="Routine name"
      />

      <Section label="Exercises" first>
        <Line />
        {routine.ex.map((slot, i) => (
          <View key={`${slot.id}-${i}`}>
            <View style={styles.slot}>
              <Pressable
                style={({ pressed }) => [styles.slotMain, pressed && { opacity: 0.55 }]}
                onPress={() => router.push(`/slot?r=${routine.id}&i=${i}`)}
                accessibilityRole="button"
                accessibilityLabel={`${exName(S, slot.id)}, ${exLine(slot, S.unit)}. Edit.`}
              >
                <Txt numberOfLines={1}>{exName(S, slot.id)}</Txt>
                <Txt variant="label" dim style={{ marginTop: 2, fontWeight: '400' }}>
                  {exLine(slot, S.unit)}{slot.sg ? ' · superset' : ''}
                </Txt>
              </Pressable>
              <View style={styles.order}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityRole="button" accessibilityLabel="Move up" style={i === 0 ? { opacity: 0.2 } : null}>
                  <Icon name="up" size={20} color={C.dim} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === routine.ex.length - 1} hitSlop={6} accessibilityRole="button" accessibilityLabel="Move down" style={i === routine.ex.length - 1 ? { opacity: 0.2 } : null}>
                  <Icon name="down" size={20} color={C.dim} />
                </Pressable>
              </View>
            </View>
            <Line />
          </View>
        ))}
        {!routine.ex.length ? <Txt dim style={{ paddingVertical: SP.lg }}>Nothing here yet.</Txt> : null}
        <View style={{ marginTop: SP.lg }}>
          <Btn label="Add exercise" kind="outline" icon="plus" onPress={addExercise} />
        </View>
      </Section>

      <Section label="Progression">
        <Segmented options={RULES} value={rule === 'greyskull' ? 'linear' : (rule as Policy)} onChange={prog => edit(r => { r.prog = prog })} />
        <Txt variant="label" dim style={{ marginTop: SP.md, fontWeight: '400' }}>{POLICY_DESC[rule]}</Txt>
      </Section>

      <View style={{ marginTop: SP.xxl, alignItems: 'flex-start' }}>
        <Link label="Duplicate this routine" onPress={duplicate} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  name: { color: C.white, fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, paddingVertical: SP.sm, marginTop: SP.sm },
  slot: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: SP.md },
  slotMain: { flex: 1, paddingVertical: SP.md },
  order: { flexDirection: 'row', gap: SP.md },
})
