import { router } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { setsDone } from '@/engine'
import { workoutLine } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Empty, Line, Row, Screen, Section, Txt } from '@/ui'

export default function History() {
  const S = useStore(s => s.S)
  const workouts = useMemo(
    () => S.workouts.slice().sort((a, b) => (a.d === b.d ? (b.start || 0) - (a.start || 0) : a.d < b.d ? 1 : -1)),
    [S.workouts],
  )

  return (
    <Screen>
      <View style={{ height: 52 }} />
      <Txt variant="display">Log</Txt>
      {workouts.length ? (
        <Section label={workouts.length === 1 ? '1 workout' : `${workouts.length} workouts`} first>
          <Line />
          {workouts.map(w => (
            <Row
              key={w.id || `${w.d}-${w.start}`}
              title={w.name || 'Workout'}
              subtitle={workoutLine(w, S.unit, setsDone(w))}
              value={w.prs?.length ? `${w.prs.length} PR` : undefined}
              onPress={() => router.push(`/session/${w.id}`)}
              chevron
            />
          ))}
        </Section>
      ) : (
        <Empty title="Nothing logged yet." body="Finished workouts show up here, newest first." />
      )}
    </Screen>
  )
}
