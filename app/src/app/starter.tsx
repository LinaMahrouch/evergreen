import { router } from 'expo-router'
import { buildStarterPlan, starterPlanOptions } from '@/engine'
import { useStore } from '@/store/useStore'
import { Line, Row, SP, Screen, TopBar, Txt, confirm } from '@/ui'

// The plans themselves are openGym's starter catalogue; these are only the words for them.
const COPY: Record<string, { name: string; about: string }> = {
  ppl: { name: 'Push / Pull / Legs', about: 'Three sessions split by movement. A good default.' },
  'upper-lower': { name: 'Upper / Lower', about: 'Four sessions, each half of the body twice a week.' },
  'full-body': { name: 'Full Body', about: 'Three whole-body sessions. Suits a busy week.' },
  '5x5': { name: '5 × 5', about: 'Three short, heavy sessions built on the big lifts.' },
}

export default function Starter() {
  const hasWeek = useStore(s => Object.keys(s.S.week).length > 0)
  const update = useStore(s => s.update)

  const choose = async (id: string) => {
    const plan = buildStarterPlan(id)
    if (!plan) return
    if (hasWeek && !(await confirm('Replace your week?', 'The plan\'s routines are added to yours, and its training days replace the ones you have now.', 'Replace'))) return
    update(s => {
      s.routines.push(...plan.routines)
      // A half-replaced week would quietly mix two plans, so the plan's week is the whole week.
      s.week = {}
      for (const { day, routineId } of plan.schedule) s.week[day] = [routineId]
    })
    router.dismissTo('/')
  }

  return (
    <Screen>
      <TopBar close />
      <Txt variant="title" style={{ marginTop: SP.md, marginBottom: SP.xl }}>Starter plans</Txt>
      <Line />
      {starterPlanOptions().map(o => (
        <Row
          key={o.id}
          strong
          title={COPY[o.id]?.name || o.id}
          subtitle={`${o.days} days a week. ${COPY[o.id]?.about || ''}`}
          onPress={() => choose(o.id)}
          chevron
        />
      ))}
      <Txt dim variant="label" style={{ marginTop: SP.xl, fontWeight: '400' }}>
        Every exercise, set and rep can be changed afterwards. Weights start empty and fill in as you train.
      </Txt>
    </Screen>
  )
}
