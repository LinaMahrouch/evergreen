import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { setsDone } from '@/engine'
import { duration, exName, volume } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Btn, Line, Row, SP, Screen, Section, Txt } from '@/ui'

/** What you just did, said once. */
export default function Summary() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const S = useStore(s => s.S)
  const w = S.workouts.find(x => x.id === id)
  const close = () => router.dismissTo('/')

  if (!w) {
    return <Screen footer={<Btn label="Done" onPress={close} />}><Txt variant="display" style={{ marginTop: SP.xxxl }}>Saved.</Txt></Screen>
  }

  return (
    <Screen footer={<Btn label="Done" onPress={close} />}>
      <View style={{ height: 52 }} />
      <Txt variant="caption" dim>{w.name}</Txt>
      <Txt variant="display" style={{ marginTop: SP.sm }}>Done.</Txt>

      <Section first>
        <Line />
        <Row title="Time" value={duration(w.end - w.start)} />
        <Row title="Sets" value={String(setsDone(w))} />
        {w.vol ? <Row title="Volume" value={volume(w.vol, S.unit)} /> : null}
        <Row title="Exercises" value={String(w.entries.length)} />
      </Section>

      {w.prs.length ? (
        <Section label={w.prs.length === 1 ? 'New record' : 'New records'}>
          <Line />
          {w.prs.map(exId => <Row key={exId} title={exName(S, exId)} value="Heaviest yet" />)}
        </Section>
      ) : null}
    </Screen>
  )
}
