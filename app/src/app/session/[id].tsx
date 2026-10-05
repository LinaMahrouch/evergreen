import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { setsDone } from '@/engine'
import { duration, exName, longDate, setText, volume } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { C, Empty, IconBtn, Line, Row, SP, Screen, Section, TopBar, Txt, confirm } from '@/ui'

/** One finished workout, set by set. */
export default function Session() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const w = S.workouts.find(x => x.id === id)

  if (!w) return <Screen><TopBar /><Empty title="This workout is gone." body="It may have been deleted on another device." /></Screen>

  const remove = async () => {
    if (!(await confirm('Delete this workout?', 'It is removed from your log and your statistics.', 'Delete'))) return
    router.back()
    update(s => { s.workouts = s.workouts.filter(x => x.id !== w.id) })
  }

  const facts = [w.end && w.start ? duration(w.end - w.start) : null, `${setsDone(w)} sets`, w.vol ? volume(w.vol, S.unit) : null].filter(Boolean)

  return (
    <Screen>
      <TopBar right={<IconBtn name="trash" label="Delete workout" onPress={remove} color={C.dim} />} />
      <Txt variant="caption" dim style={{ marginTop: SP.md }}>{longDate(w.d)}</Txt>
      <Txt variant="title" style={{ marginTop: SP.xs }}>{w.name || 'Workout'}</Txt>
      <Txt dim style={{ marginTop: SP.sm }}>{facts.join(' · ')}</Txt>
      {w.note ? <Txt style={{ marginTop: SP.lg }}>{w.note}</Txt> : null}

      {w.entries.map((e, i) => (
        <Section key={i} label={exName(S, e.id) + (w.prs?.includes(e.id) ? '  ·  record' : '')} first={i === 0}>
          <Line />
          {e.sets.filter(s => s.done).map((s, row) => (
            <Row key={row} title={setText(S.unit, e.id, s, e.target)} left={<View style={{ width: 28 }}><Txt dim>{row + 1}</Txt></View>} />
          ))}
        </Section>
      ))}
    </Screen>
  )
}
