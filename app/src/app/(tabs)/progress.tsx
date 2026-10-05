import { router } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { MUSCLE_NAME, fmtNum, levelsOf, loadOfWorkouts, rankOf, streakWeeks, todayISO } from '@/engine'
import { records } from '@/lib/stats'
import { cap, exName, shortDate, weight } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Btn, C, Empty, Line, Link, Row, SP, Screen, Section, Txt } from '@/ui'
import { LineChart } from '@/ui/LineChart'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="title">{value}</Txt>
      <Txt variant="caption" dim style={{ marginTop: 4 }}>{label}</Txt>
    </View>
  )
}

export default function Progress() {
  const S = useStore(s => s.S)
  const today = todayISO()

  const week = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000
    return S.workouts.filter(w => (w.start || new Date(w.d + 'T12:00:00').getTime()) >= cutoff)
  }, [S.workouts])
  const streak = useMemo(() => streakWeeks(S), [S])
  const best = useMemo(() => records(S).slice(0, 8), [S])
  const muscles = useMemo(() => {
    const load = loadOfWorkouts(week)
    const { worked, missed } = rankOf(load)
    const levels = levelsOf(load)
    return { worked: worked.map(slug => ({ slug, level: levels[slug] || 1 })), missed }
  }, [week])

  const weighIns = S.bodyweight.slice(-60)
  const last = weighIns[weighIns.length - 1]
  const first = weighIns[0]
  const change = last && first && weighIns.length > 1 ? Math.round((last.w - first.w) * 10) / 10 : null

  if (!S.workouts.length && !S.bodyweight.length) {
    return (
      <Screen>
        <View style={{ height: 52 }} />
        <Txt variant="display">Progress</Txt>
        <Empty title="Nothing to chart yet." body="Log a workout or a weigh-in and this page fills in.">
          <Btn label="Log body weight" kind="outline" onPress={() => router.push('/weigh')} />
        </Empty>
      </Screen>
    )
  }

  return (
    <Screen>
      <View style={{ height: 52 }} />
      <Txt variant="display">Progress</Txt>

      <View style={styles.stats}>
        <Stat value={String(week.length)} label="Last 7 days" />
        <Stat value={String(streak)} label={streak === 1 ? 'Week streak' : 'Weeks streak'} />
        <Stat value={String(S.workouts.length)} label="All time" />
      </View>

      <Section label="Body weight" right={<Link label={last?.d === today ? 'Change' : 'Log'} onPress={() => router.push('/weigh')} />}>
        {last ? (
          <>
            <View style={styles.weightHead}>
              <Txt variant="title">{weight(last.w, S.unit)}</Txt>
              <Txt variant="label" dim>
                {change != null && change !== 0 ? `${change > 0 ? '+' : '−'}${fmtNum(Math.abs(change))} ${S.unit} since ${shortDate(first.d)}` : shortDate(last.d)}
              </Txt>
            </View>
            {weighIns.length > 1 ? (
              <View style={{ marginTop: SP.lg }}>
                <LineChart points={weighIns.map(b => b.w)} goal={S.targetW || null} format={v => weight(Math.round(v * 10) / 10, S.unit)} />
              </View>
            ) : (
              <Txt variant="label" dim style={{ marginTop: SP.sm, fontWeight: '400' }}>One more weigh-in draws the line.</Txt>
            )}
            {S.targetW ? <Txt variant="label" dim style={{ marginTop: SP.sm, fontWeight: '400' }}>Goal {weight(S.targetW, S.unit)} (dashed).</Txt> : null}
          </>
        ) : (
          <Txt dim>No weigh-ins yet.</Txt>
        )}
      </Section>

      {best.length ? (
        <Section label="Strongest lifts">
          <Line />
          {best.map(r => (
            <Row
              key={r.id}
              title={exName(S, r.id)}
              subtitle={`${fmtNum(r.w)} ${S.unit} × ${r.r} · ${shortDate(r.d)}`}
              value={weight(Math.round(r.est), S.unit)}
              onPress={() => router.push(`/exercise/${r.id}`)}
              chevron
            />
          ))}
          <Txt variant="label" faint style={{ marginTop: SP.sm, fontWeight: '400' }}>Estimated one-rep max, from your best set.</Txt>
        </Section>
      ) : null}

      {muscles.worked.length ? (
        <Section label="Muscles, last 7 days">
          <Line />
          {muscles.worked.map(m => (
            <View key={m.slug}>
              <View style={styles.muscle}>
                <Txt style={{ flex: 1 }}>{cap(MUSCLE_NAME[m.slug] || m.slug)}</Txt>
                <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(4, m.level) * 25}%` }]} /></View>
              </View>
              <Line />
            </View>
          ))}
          {muscles.missed.length ? (
            <Txt variant="label" dim style={{ marginTop: SP.md, fontWeight: '400' }}>
              Not trained: {muscles.missed.map(slug => (MUSCLE_NAME[slug] || slug).toLowerCase()).join(', ')}.
            </Txt>
          ) : null}
        </Section>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: SP.xl, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingVertical: SP.lg },
  stat: { flex: 1 },
  weightHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  muscle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: SP.lg },
  track: { width: 96, height: 4, backgroundColor: C.lift, borderRadius: 2 },
  fill: { height: 4, backgroundColor: C.white, borderRadius: 2 },
})
