import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { defaultConfig, fmtNum, fmtSec, isCardio, modeOf, type Mode, type Slot } from '@/engine'
import { exName } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Empty, Field, Link, SP, Screen, Section, Segmented, Stepper, TopBar, Txt, confirm } from '@/ui'

/** How one exercise is planned inside a routine: sets, reps or time, starting weight, rest. */
export default function SlotEdit() {
  const { r, i } = useLocalSearchParams<{ r: string; i: string }>()
  const index = Number(i) || 0
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const routine = S.routines.find(x => x.id === r)
  const slot = routine?.ex[index]

  if (!routine || !slot) {
    return <Screen><TopBar /><Empty title="This exercise is no longer in the routine." /></Screen>
  }

  const edit = (mut: (slot: Slot) => void) => update(s => {
    const target = s.routines.find(x => x.id === r)?.ex[index]
    if (target) mut(target)
  })

  const mode = modeOf(slot)
  const cardio = isCardio(slot.id)
  const step = S.unit === 'lb' ? 5 : 2.5
  const range = slot.repsMin != null && slot.repsMin > 0 && slot.repsMin < (slot.reps || 0)

  const setMode = (next: Mode) => {
    if (next === mode) return
    // Reps and seconds are different things: the other mode starts from its own defaults and
    // keeps only what means the same in both.
    edit(target => {
      const kept = { sets: target.sets, weight: target.weight, restSec: target.restSec, note: target.note, sg: target.sg }
      for (const key of Object.keys(target)) if (key !== 'id') delete target[key]
      Object.assign(target, defaultConfig(target.id, next), Object.fromEntries(Object.entries(kept).filter(([, v]) => v != null)))
    })
  }

  const remove = async () => {
    if (!(await confirm(`Remove ${exName(S, slot.id)}?`, `It comes out of “${routine.name}”. Your logged sets of it are kept.`, 'Remove'))) return
    router.back()
    update(s => { s.routines.find(x => x.id === r)?.ex.splice(index, 1) })
  }

  return (
    <Screen>
      <TopBar title={routine.name} />
      <Txt variant="title" style={{ marginTop: SP.md }}>{exName(S, slot.id)}</Txt>
      <View style={{ marginTop: SP.sm, alignItems: 'flex-start' }}>
        <Link label="How to do it" onPress={() => router.push(`/exercise/${slot.id}`)} />
      </View>

      {!cardio ? (
        <View style={{ marginTop: SP.xl }}>
          <Segmented<Mode>
            options={[{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Time' }]}
            value={mode === 'time' ? 'time' : 'reps'}
            onChange={setMode}
          />
        </View>
      ) : null}

      <Section first>
        <Stepper label="Sets" value={slot.sets || 1} min={1} max={20} onChange={v => edit(t => { t.sets = Math.round(v) })} />

        {mode === 'cardio' ? (
          <>
            <Stepper label="Minutes" value={slot.min || 20} min={1} max={600} onChange={v => edit(t => { t.min = v })} />
            <Stepper label="Speed" value={slot.speed || 8} min={0.5} max={60} step={0.5} suffix="km/h" format={fmtNum} onChange={v => edit(t => { t.speed = v })} />
          </>
        ) : null}

        {mode === 'time' ? (
          <Stepper label="Hold" value={slot.sec || 45} min={5} max={3600} step={5} format={fmtSec} onChange={v => edit(t => { t.sec = Math.round(v) })} />
        ) : null}

        {mode === 'reps' ? (
          <>
            <Stepper
              label={range ? 'Reps, up to' : 'Reps'}
              value={slot.reps || 10} min={1} max={200}
              onChange={v => edit(t => { t.reps = Math.round(v); if (t.repsMin != null && t.repsMin >= t.reps) delete t.repsMin })}
            />
            <Stepper
              label="Reps, from"
              value={range ? (slot.repsMin as number) : 0} min={0} max={Math.max(0, (slot.reps || 10) - 1)}
              format={v => (v > 0 ? String(v) : 'Off')}
              onChange={v => edit(t => {
                const n = Math.round(v)
                if (n > 0) { t.repsMin = n; if (!t.prog) t.prog = 'double' } else { delete t.repsMin; if (t.prog === 'double') delete t.prog }
              })}
            />
          </>
        ) : null}

        {mode !== 'cardio' ? (
          <Stepper
            label={slot.bodyweight ? 'Added weight' : 'Weight'}
            value={slot.weight || 0} min={0} max={2000} step={step} suffix={S.unit}
            format={v => (v > 0 ? fmtNum(v) : slot.bodyweight ? 'None' : 'Auto')}
            onChange={v => edit(t => { t.weight = v })}
          />
        ) : null}

        <Stepper
          label="Rest"
          value={slot.restSec || 0} min={0} max={1800} step={15}
          format={v => (v > 0 ? fmtSec(v) : 'Default')}
          onChange={v => edit(t => { if (v > 0) t.restSec = Math.round(v); else delete t.restSec })}
        />

        {mode !== 'cardio' ? (
          <Stepper
            label="Warm-up sets"
            value={slot.warmupSets || 0} min={0} max={5}
            format={v => (v > 0 ? String(v) : 'None')}
            onChange={v => edit(t => { if (v > 0) t.warmupSets = Math.round(v); else delete t.warmupSets })}
          />
        ) : null}
      </Section>

      {mode === 'reps' && !slot.bodyweight && !(slot.weight && slot.weight > 0) ? (
        <Txt variant="label" dim style={{ marginTop: SP.md, fontWeight: '400' }}>
          Auto starts from what you last lifted, and from empty the first time.
        </Txt>
      ) : null}
      {range ? (
        <Txt variant="label" dim style={{ marginTop: SP.md, fontWeight: '400' }}>
          You work up from {slot.repsMin} to {slot.reps} reps, then the weight goes up and you start again at {slot.repsMin}.
        </Txt>
      ) : null}

      <Section label="Note">
        <Field
          value={slot.note || ''}
          onChangeText={text => edit(t => { if (text) t.note = text.slice(0, 400); else delete t.note })}
          placeholder="A cue for yourself"
          autoCapitalize="sentences"
          multiline
        />
      </Section>

      <View style={{ marginTop: SP.xxl, alignItems: 'flex-start' }}>
        <Link label="Remove from routine" onPress={remove} />
      </View>
    </Screen>
  )
}
