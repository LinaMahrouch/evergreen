import { useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { View } from 'react-native'
import { best1RM, bestWeightFor, e1rmSeries, fmtNum, type Slot } from '@/engine'
import { sessionsOf } from '@/lib/stats'
import { cap, exerciseOf, setText, shortDate, weight } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Line, Row, SP, Screen, Section, TopBar, Txt } from '@/ui'
import { ExerciseMedia } from '@/ui/ExerciseMedia'
import { LineChart } from '@/ui/LineChart'

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const S = useStore(s => s.S)
  const ex = exerciseOf(S, id)

  const best = useMemo(() => best1RM(S, id), [S, id])
  const top = useMemo(() => bestWeightFor(S, id), [S, id])
  const series = useMemo(() => e1rmSeries(S, id), [S, id])
  const sessions = useMemo(() => sessionsOf(S, id).slice(0, 5), [S, id])

  const facts = [ex.bp, ex.eq, ex.tg].filter(Boolean).map(v => cap(v as string))
  const steps = ex.st && ex.st.length ? ex.st : ex.desc ? [ex.desc] : []

  return (
    <Screen>
      <TopBar />
      <Txt variant="title" style={{ marginTop: SP.md }}>{cap(ex.n)}</Txt>
      {facts.length ? <Txt dim style={{ marginTop: SP.sm }}>{facts.join(' · ')}</Txt> : null}
      <View style={{ marginTop: SP.xl, alignItems: 'center' }}><ExerciseMedia ex={ex} kind="motion" size={280} /></View>

      {top > 0 || best ? (
        <Section label="Your best" first>
          <Line />
          {top > 0 ? <Row title="Heaviest set" value={weight(top, S.unit)} /> : null}
          {best ? <Row title="Estimated 1RM" subtitle={`From ${fmtNum(best.w)} ${S.unit} × ${best.r} on ${shortDate(best.d)}`} value={weight(Math.round(best.est * 10) / 10, S.unit)} /> : null}
          {series.length > 1 ? (
            <View style={{ marginTop: SP.xl }}>
              <LineChart points={series.map(p => p.y)} format={v => weight(Math.round(v), S.unit)} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {sessions.length ? (
        <Section label="Last sessions">
          <Line />
          {sessions.map((s, i) => (
            <Row
              key={i}
              title={shortDate(s.d)}
              subtitle={s.sets.map(row => setText(S.unit, id, row, s.target as Slot)).join(',  ')}
            />
          ))}
        </Section>
      ) : null}

      {steps.length ? (
        <Section label="How to do it">
          {steps.map((step, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: SP.md, marginBottom: SP.md }}>
              <Txt dim style={{ width: 20 }}>{i + 1}</Txt>
              <Txt style={{ flex: 1 }}>{step}</Txt>
            </View>
          ))}
        </Section>
      ) : null}
    </Screen>
  )
}
