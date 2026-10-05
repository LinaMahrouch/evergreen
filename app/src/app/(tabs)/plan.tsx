import { router } from 'expo-router'
import { View } from 'react-native'
import { DAYN, uid } from '@/engine'
import { countLabel, routinesOn, weekOrder } from '@/lib/plan'
import { useStore } from '@/store/useStore'
import { Btn, Line, Link, Row, SP, Screen, Section, Txt } from '@/ui'

export default function Plan() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)

  const create = () => {
    const id = uid()
    update(s => { s.routines.push({ id, name: 'New routine', emoji: 'figureStrength', ex: [] }) })
    router.push(`/routine/${id}`)
  }

  return (
    <Screen>
      <View style={{ height: 52 }} />
      <Txt variant="display">Plan</Txt>

      <Section label="Week" first>
        <Line />
        {weekOrder(S).map(d => {
          const on = routinesOn(S, d)
          return (
            <Row
              key={d}
              title={DAYN[d]}
              value={on.length ? on.map(r => r.name).join(' + ') : 'Rest'}
              onPress={() => router.push(`/day/${d}`)}
              chevron
            />
          )
        })}
      </Section>

      <Section label="Routines" right={S.routines.length ? <Link label="Starter plans" onPress={() => router.push('/starter')} /> : undefined}>
        <Line />
        {S.routines.map(r => (
          <Row
            key={r.id}
            title={r.name}
            subtitle={countLabel(r.ex.length, 'exercise', 'exercises')}
            onPress={() => router.push(`/routine/${r.id}`)}
            chevron
          />
        ))}
        {!S.routines.length ? (
          <Txt dim style={{ paddingVertical: SP.lg }}>No routines yet. A routine is a list of exercises you do in one session.</Txt>
        ) : null}
        <View style={{ marginTop: SP.lg, gap: SP.md }}>
          <Btn label="New routine" kind="outline" icon="plus" onPress={create} />
          {!S.routines.length ? <Btn label="Choose a starter plan" onPress={() => router.push('/starter')} /> : null}
        </View>
      </Section>
    </Screen>
  )
}
