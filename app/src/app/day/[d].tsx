import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { DAYN } from '@/engine'
import { useStore } from '@/store/useStore'
import { C, Icon, Line, Row, SP, Screen, TopBar, Txt } from '@/ui'

/** Which routines fall on one weekday. Tick one for a training day, two for a combined session. */
export default function Day() {
  const { d } = useLocalSearchParams<{ d: string }>()
  const day = Math.min(6, Math.max(0, Number(d) || 0))
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const chosen = ([] as string[]).concat(S.week[day] || []).filter(id => S.routines.some(r => r.id === id))

  const set = (ids: string[]) => update(s => { if (ids.length) s.week[day] = ids; else delete s.week[day] })
  const toggle = (id: string) => set(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id])

  const tick = (on: boolean) => (
    <View style={{ width: 24, alignItems: 'center' }}>{on ? <Icon name="check" size={20} /> : null}</View>
  )

  return (
    <Screen>
      <TopBar close />
      <Txt variant="title" style={{ marginTop: SP.md, marginBottom: SP.xl }}>{DAYN[day]}</Txt>
      <Line />
      <Row title="Rest" onPress={() => set([])} right={tick(chosen.length === 0)} />
      {S.routines.map(r => (
        <Row
          key={r.id}
          title={r.name}
          subtitle={r.ex.length === 1 ? '1 exercise' : `${r.ex.length} exercises`}
          onPress={() => toggle(r.id)}
          right={tick(chosen.includes(r.id))}
        />
      ))}
      {!S.routines.length ? (
        <Txt dim style={{ paddingVertical: SP.lg, color: C.dim }}>Make a routine first, then put it on a day.</Txt>
      ) : chosen.length > 1 ? (
        <Txt dim variant="label" style={{ marginTop: SP.lg, fontWeight: '400' }}>Two routines on one day are trained as one session, in this order.</Txt>
      ) : null}
    </Screen>
  )
}
