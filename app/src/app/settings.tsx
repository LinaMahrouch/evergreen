import Constants from 'expo-constants'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Linking, View } from 'react-native'
import { convertStateUnit, fmtNum, fmtSec, type Unit } from '@/engine'
import { MODELS } from '@/coach/client'
import { useCoach } from '@/coach/useCoach'
import { exportBackup, pickBackup } from '@/lib/backup'
import { SOURCE_URL } from '@/lib/config'
import { DEF, useStore } from '@/store/useStore'
import { Btn, Line, Link, Row, SP, Screen, Section, Segmented, Stepper, TopBar, Txt, confirm, notify } from '@/ui'

const STATUS_TEXT = {
  local: 'On this device only',
  ok: 'In sync',
  syncing: 'Syncing…',
  offline: 'Offline. Changes are kept here and sent when the server is reachable.',
  denied: 'The server no longer accepts this device. Connect again to keep syncing.',
  error: 'The server answered with an error.',
} as const

export default function Settings() {
  const S = useStore(s => s.S)
  const remote = useStore(s => s.remote)
  const status = useStore(s => s.status)
  const syncError = useStore(s => s.syncError)
  const lastSync = useStore(s => s.lastSync)
  const update = useStore(s => s.update)
  const replace = useStore(s => s.replace)
  const [busy, setBusy] = useState(false)
  const coach = useCoach()
  useEffect(() => { void coach.boot() }, [coach.boot])

  const removeKey = async () => {
    if (await confirm('Remove the API key?', 'The coach stops working on this device until you enter a key again. Your plan and your log are not touched.', 'Remove')) await coach.setKey(null)
  }

  const setUnit = async (to: Unit) => {
    if (to === S.unit) return
    if (!(await confirm(`Switch to ${to}?`, `Every weight you have logged is converted from ${S.unit} to ${to}.`, 'Switch'))) return
    // Stamped the way openGym stamps it, so another device still in the old unit is converted
    // when it next syncs instead of being mixed in number by number.
    replace({ ...convertStateUnit(S, to), unitSet: { at: Date.now(), convert: true } })
  }

  const doExport = async () => {
    try { await exportBackup(S) } catch (e) { notify('Could not export', e instanceof Error ? e.message : undefined) }
  }

  const doImport = async () => {
    try {
      const doc = await pickBackup()
      if (!doc) return
      const where = remote ? ', here and on your server' : ''
      const ok = await confirm(
        'Replace everything with this backup?',
        `The backup holds ${doc.routines?.length || 0} routines and ${doc.workouts?.length || 0} workouts. What is on this device now is replaced${where}.`,
        'Replace',
      )
      if (!ok) return
      replace(doc)
      notify('Backup restored')
    } catch (e) {
      notify('Could not import', e instanceof Error ? e.message : undefined)
    }
  }

  const disconnect = async () => {
    if (!(await confirm('Disconnect from the server?', 'Everything stays on this device. It just stops syncing until you connect again.', 'Disconnect'))) return
    await useStore.getState().unpair()
  }

  const erase = async () => {
    const ok = await confirm(
      'Erase everything?',
      'Every routine, workout and weigh-in on this device is deleted, and the conversation with the coach. This cannot be undone. Export a backup first if you might want it back.',
      'Erase',
    )
    if (!ok) return
    replace({ ...DEF, unit: S.unit })
    coach.clear()
    useStore.getState().discardWorkout()
    router.dismissTo('/')
  }

  const syncNow = async () => {
    setBusy(true)
    await useStore.getState().sync()
    setBusy(false)
  }

  const checked = lastSync
    ? `Last checked ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : undefined

  return (
    <Screen>
      <TopBar />
      <Txt variant="display" style={{ marginTop: SP.sm }}>Settings</Txt>

      <Section label="Units" first>
        <Segmented<Unit>
          options={[{ value: 'kg', label: 'Kilograms' }, { value: 'lb', label: 'Pounds' }]}
          value={S.unit}
          onChange={setUnit}
        />
      </Section>

      <Section label="Training">
        <Line />
        <Stepper
          label="Rest between sets"
          value={S.restSec} min={0} max={900} step={15}
          format={v => (v > 0 ? fmtSec(v) : 'Off')}
          onChange={v => update(s => { s.restSec = Math.round(v) })}
        />
        <Stepper
          label="Goal weight"
          value={S.targetW || 0} min={0} max={700} step={0.5}
          suffix={S.targetW ? S.unit : undefined}
          format={v => (v > 0 ? fmtNum(v) : 'None')}
          onChange={v => update(s => { s.targetW = v > 0 ? v : null })}
        />
      </Section>

      <Section label="Coach">
        {coach.hasKey ? (
          <>
            <Segmented options={MODELS.map(m => ({ value: m.value, label: m.label }))} value={coach.model} onChange={coach.setModel} />
            <Txt variant="label" dim style={{ marginTop: SP.md, fontWeight: '400' }}>{MODELS.find(m => m.value === coach.model)?.note}</Txt>
            <View style={{ marginTop: SP.lg, alignItems: 'flex-start' }}><Link label="Remove the API key" onPress={() => { void removeKey() }} /></View>
          </>
        ) : (
          <Txt dim>The Coach tab plans your training when you give it an Anthropic API key. Nothing is sent anywhere until you do.</Txt>
        )}
      </Section>

      <Section label="Sync">
        <Line />
        {remote ? (
          <>
            <Row title={remote.user?.name || 'Your profile'} subtitle={remote.url} />
            <Row title={STATUS_TEXT[status]} subtitle={status === 'error' && syncError ? syncError : checked} />
            <View style={{ marginTop: SP.lg, gap: SP.md }}>
              <Btn label={busy ? 'Syncing…' : 'Sync now'} kind="outline" disabled={busy} onPress={syncNow} />
              {status === 'denied' ? <Btn label="Connect again" onPress={() => router.push('/connect')} /> : null}
              <View style={{ alignItems: 'flex-start' }}><Link label="Disconnect" onPress={disconnect} /></View>
            </View>
          </>
        ) : (
          <>
            <Txt dim style={{ paddingVertical: SP.lg }}>
              Your data lives on this device. Connect to your own openGym server to keep it in sync across devices, and to let an AI assistant plan your training.
            </Txt>
            <Btn label="Connect to a server" kind="outline" onPress={() => router.push('/connect')} />
          </>
        )}
        <View style={{ marginTop: SP.lg, alignItems: 'flex-start' }}>
          <Link label="Use your own AI assistant instead" onPress={() => router.push('/assistant')} />
        </View>
      </Section>

      <Section label="Your data">
        <Line />
        <Row title="Export a backup" subtitle="One file with everything in it." onPress={doExport} chevron />
        <Row title="Import a backup" subtitle="Replaces what is here now." onPress={doImport} chevron />
        {!remote ? <Row title="Erase everything" onPress={erase} chevron /> : null}
      </Section>

      <Section label="About">
        <Txt dim>
          Evergreen {Constants.expoConfig?.version || ''}. Free software under the GNU AGPL 3.0, built on openGym by Duarte Santos: its exercise library, its training logic and its sync.
        </Txt>
        <View style={{ marginTop: SP.md, alignItems: 'flex-start' }}>
          <Link label="Source code and licences" onPress={() => { void Linking.openURL(SOURCE_URL) }} />
        </View>
      </Section>
    </Screen>
  )
}
