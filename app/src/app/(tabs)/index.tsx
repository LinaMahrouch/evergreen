import { router } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import {
  DAYS, buildCombinedEntries, effectiveRoutineIds, effectiveRoutines, isoOf, nextTrainingDay, todayISO,
  type State,
} from '@/engine'
import { entrySummary, exName, longDate, weight } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { Btn, C, IconBtn, Line, Link, Row, SP, Screen, Section, Txt } from '@/ui'

/** The seven days of this week, Monday first: what is planned, what got done. */
function weekOf(S: State, today: string) {
  const now = new Date(today + 'T12:00:00')
  const start = Number(S.weekStart) === 0 ? 0 : 1
  const offset = (now.getDay() - start + 7) % 7
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - offset + i)
    const iso = isoOf(d)
    return {
      iso,
      letter: DAYS[d.getDay()].charAt(0),
      today: iso === today,
      planned: effectiveRoutineIds(S, iso).length > 0,
      done: S.workouts.some(w => w.d === iso),
    }
  })
}

function WeekStrip({ S, today }: { S: State; today: string }) {
  const days = useMemo(() => weekOf(S, today), [S, today])
  return (
    <View style={styles.week} accessibilityLabel="This week">
      {days.map(d => (
        <View key={d.iso} style={styles.day}>
          <Txt variant="label" style={{ color: d.today ? C.white : C.faint, fontWeight: d.today ? '700' : '500' }}>{d.letter}</Txt>
          <View
            style={[
              styles.dot,
              d.done ? { backgroundColor: C.green, borderColor: C.green } : d.planned ? { borderColor: C.dim } : { borderColor: 'transparent' },
            ]}
          />
        </View>
      ))}
    </View>
  )
}

const SYNC_NOTE = {
  offline: 'Offline. Your changes are kept on this device and sent when the server is back.',
  denied: 'Your server no longer accepts this device. Tap to connect again.',
  error: 'Your server answered with an error. Tap for details.',
} as const

/** Says so, once and quietly, when a paired app is not in step with its server. */
function SyncNote() {
  const paired = useStore(s => !!s.remote)
  const status = useStore(s => s.status)
  if (!paired || (status !== 'offline' && status !== 'denied' && status !== 'error')) return null
  return (
    <Pressable onPress={() => router.push(status === 'denied' ? '/connect' : '/settings')} accessibilityRole="button" style={styles.note}>
      <Txt variant="label" dim style={{ fontWeight: '400' }}>{SYNC_NOTE[status]}</Txt>
    </Pressable>
  )
}

function Welcome() {
  return (
    <View style={{ paddingTop: SP.xxl }}>
      <Txt variant="display">Start{'\n'}with a plan.</Txt>
      <Txt dim style={{ marginTop: SP.lg }}>
        A plan is a few routines and the days you train them. Pick one that is ready to go, or build your own.
      </Txt>
      <View style={{ marginTop: SP.xxl, gap: SP.md }}>
        <Btn label="Choose a starter plan" onPress={() => router.push('/starter')} />
        <Btn label="Build my own" kind="outline" onPress={() => router.push('/plan')} />
      </View>
      <View style={{ marginTop: SP.xl, alignItems: 'center' }}>
        <Link label="I already have a profile on a server" onPress={() => router.push('/connect')} />
      </View>
    </View>
  )
}

export default function Today() {
  const S = useStore(s => s.S)
  const active = useStore(s => s.active)
  const startWorkout = useStore(s => s.startWorkout)
  const today = todayISO()

  const routines = useMemo(() => effectiveRoutines(S, today), [S, today])
  const trainable = routines.some(r => r.ex.length > 0)
  // The session as it will actually open: weights and reps after progression, not the plan's.
  const preview = useMemo(
    () => (trainable ? buildCombinedEntries(S, routines.map(r => r.id)).entries : []),
    [S, routines, trainable],
  )
  const doneToday = S.workouts.filter(w => w.d === today)
  const next = useMemo(() => nextTrainingDay(S, today), [S, today])
  const lastWeigh = S.bodyweight[S.bodyweight.length - 1]

  const begin = () => {
    startWorkout(routines.map(r => r.id))
    router.push('/workout')
  }

  const header = (
    <View style={styles.header}>
      <Txt variant="caption" dim>{longDate(today)}</Txt>
      <IconBtn name="gear" label="Settings" onPress={() => router.push('/settings')} color={C.dim} />
    </View>
  )
  const note = <SyncNote />

  if (!S.routines.length && !S.workouts.length && !active) {
    return <Screen>{header}{note}<Welcome /></Screen>
  }

  const title = active ? active.name : trainable ? routines.map(r => r.name).join(' + ') : 'Rest day'

  return (
    <Screen
      footer={
        active ? <Btn label="Resume workout" onPress={() => router.push('/workout')} />
          : trainable && !doneToday.length ? <Btn label="Start workout" onPress={begin} />
            : undefined
      }
    >
      {header}
      {note}
      <Txt variant="display" style={{ marginTop: SP.lg }}>{title}</Txt>

      {active ? (
        <Txt dim style={{ marginTop: SP.sm }}>In progress.</Txt>
      ) : doneToday.length ? (
        <Txt dim style={{ marginTop: SP.sm }}>Done for today.</Txt>
      ) : !trainable ? (
        <Txt dim style={{ marginTop: SP.sm }}>
          {next ? `Next: ${next.routines.map(r => r.name).join(' + ')}, ${next.iso === isoOf(new Date(Date.now() + 86400000)) ? 'tomorrow' : longDate(next.iso).split(' · ')[0]}.` : 'Nothing is planned this week.'}
        </Txt>
      ) : null}

      <WeekStrip S={S} today={today} />

      {!active && trainable ? (
        <Section label={`${preview.length} exercises`} first>
          <Line />
          {preview.map((e, i) => (
            <Row key={i} title={exName(S, e.id)} value={entrySummary(e, S.unit)} />
          ))}
          {doneToday.length ? (
            <View style={{ marginTop: SP.lg }}>
              <Btn label="Train again" kind="outline" onPress={begin} />
            </View>
          ) : null}
        </Section>
      ) : null}

      {!active && !trainable ? (
        <Section first>
          <Btn label="Start a workout anyway" kind="outline" onPress={() => router.push('/plan')} />
        </Section>
      ) : null}

      <Section label="Body weight">
        <Line />
        <Pressable onPress={() => router.push('/weigh')} accessibilityRole="button" style={({ pressed }) => (pressed ? { opacity: 0.55 } : null)}>
          <View style={styles.weighRow}>
            <Txt variant="num">{lastWeigh ? weight(lastWeigh.w, S.unit) : '—'}</Txt>
            <Txt variant="label" dim>{lastWeigh ? (lastWeigh.d === today ? 'Today' : longDate(lastWeigh.d).split(' · ')[1]) : 'Log your first weigh-in'}</Txt>
          </View>
        </Pressable>
        <Line />
      </Section>
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SP.xl, marginBottom: SP.sm },
  day: { alignItems: 'center', gap: 8, width: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  note: { paddingVertical: SP.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  weighRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
