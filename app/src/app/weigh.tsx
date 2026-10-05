import { router } from 'expo-router'
import { useState } from 'react'
import { fmtNum, todayISO } from '@/engine'
import { useStore } from '@/store/useStore'
import { Btn, SP, Screen, Section, Stepper, TopBar, Txt } from '@/ui'

/** Today's weigh-in. One per day: logging again replaces it. */
export default function Weigh() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = todayISO()
  const last = S.bodyweight[S.bodyweight.length - 1]
  const [w, setW] = useState(last?.w || (S.unit === 'lb' ? 160 : 70))

  const save = () => {
    const weight = Math.round(w * 10) / 10
    update(s => {
      s.bodyweight = [...s.bodyweight.filter(b => b.d !== today), { d: today, w: weight, t: Date.now() }]
        .sort((a, b) => (a.d < b.d ? -1 : 1))
    })
    router.back()
  }

  return (
    <Screen footer={<Btn label="Save" onPress={save} />}>
      <TopBar close />
      <Txt variant="title" style={{ marginTop: SP.md }}>Body weight</Txt>
      <Txt dim style={{ marginTop: SP.sm }}>Weigh at the same time of day and the line means more.</Txt>
      <Section first>
        <Stepper label="Today" value={w} onChange={setW} step={0.1} min={20} max={700} suffix={S.unit} format={fmtNum} />
      </Section>
    </Screen>
  )
}
