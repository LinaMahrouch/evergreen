import { router } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ApiError, normalizeUrl } from '@/store/api'
import { useStore } from '@/store/useStore'
import { Btn, Field, SP, Screen, Section, TopBar, Txt } from '@/ui'

const STEPS = [
  'Open your openGym server in a browser and sign in.',
  'Go to Settings and choose "Pair the mobile app". It shows a code that works once, for five minutes.',
  'Enter your server\'s address and that code here.',
]

/** Pairs this device with an openGym server, the same way openGym's own phone app pairs. */
export default function Connect() {
  const remote = useStore(s => s.remote)
  const [url, setUrl] = useState(remote?.url || '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const insecure = /^http:\/\//i.test(normalizeUrl(url)) && !/^http:\/\/(localhost|127\.)/i.test(normalizeUrl(url))

  const pair = async () => {
    setError(null)
    setBusy(true)
    try {
      await useStore.getState().pair(url, code)
      router.dismissTo('/')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Check the address and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen footer={<Btn label={busy ? 'Connecting…' : 'Connect'} disabled={busy || !url.trim() || code.trim().length < 4} onPress={pair} />}>
      <TopBar />
      <Txt variant="title" style={{ marginTop: SP.md }}>Connect to a server</Txt>
      <Txt dim style={{ marginTop: SP.sm }}>
        Your profile then lives on your own openGym server and stays in sync between this device, your other devices and your AI assistant.
      </Txt>

      <Section first>
        {STEPS.map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: SP.md, marginBottom: SP.md }}>
            <Txt dim style={{ width: 20 }}>{i + 1}</Txt>
            <Txt style={{ flex: 1 }}>{step}</Txt>
          </View>
        ))}
      </Section>

      <Section label="Server address">
        <Field value={url} onChangeText={setUrl} placeholder="gym.example.com" keyboardType="url" textContentType="URL" accessibilityLabel="Server address" />
      </Section>
      <Section label="Pairing code">
        <Field
          value={code}
          onChangeText={text => setCode(text.toUpperCase().replace(/\s/g, ''))}
          placeholder="ABCD1234"
          autoCapitalize="characters"
          maxLength={12}
          style={{ fontSize: 24, letterSpacing: 4, fontWeight: '600' }}
          accessibilityLabel="Pairing code"
        />
      </Section>

      {insecure ? (
        <Txt variant="label" dim style={{ marginTop: SP.lg, fontWeight: '400' }}>
          This address is not encrypted (http). That is fine on your home network; anywhere else, put the server behind https first.
        </Txt>
      ) : null}
      {error ? <Txt style={{ marginTop: SP.lg }}>{error}</Txt> : null}

      <Txt variant="label" dim style={{ marginTop: SP.xl, fontWeight: '400' }}>
        What is on this device is not lost: workouts and weigh-ins logged here are added to the profile on the server.
      </Txt>
    </Screen>
  )
}
