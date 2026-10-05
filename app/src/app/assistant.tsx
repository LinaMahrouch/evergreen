import { router } from 'expo-router'
import { Linking, View } from 'react-native'
import { ASSISTANT_GUIDE_URL } from '@/lib/config'
import { useStore } from '@/store/useStore'
import { Btn, Link, SP, Screen, Section, TopBar, Txt } from '@/ui'

const ASKS = [
  'Look at my last month and build me a four-day plan that fixes what I have been neglecting.',
  'I can only train Monday, Wednesday and Saturday now. Rearrange my week.',
  'My bench has stalled. Change my push day.',
  'I am travelling Thursday. Move that session to Friday.',
]

/**
 * Explains the one thing the app cannot do from inside itself: an assistant plans your training
 * by talking to your server, and what it writes arrives here through sync.
 */
export default function Assistant() {
  const paired = useStore(s => !!s.remote)
  return (
    <Screen>
      <TopBar />
      <Txt variant="title" style={{ marginTop: SP.md }}>Plan with an AI assistant</Txt>
      <Txt dim style={{ marginTop: SP.sm }}>
        An assistant such as Claude can read your training history and write your next routines straight into your plan. You ask in your own words; it shows up here.
      </Txt>

      <Section label="How it works" first>
        {[
          'Your profile lives on your own openGym server.',
          'The assistant connects to that server through MCP, with its own pairing code, like one more device.',
          'What it plans is saved to the server, and this app picks it up within half a minute.',
        ].map((step, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: SP.md, marginBottom: SP.md }}>
            <Txt dim style={{ width: 20 }}>{i + 1}</Txt>
            <Txt style={{ flex: 1 }}>{step}</Txt>
          </View>
        ))}
      </Section>

      <Section label="Things to ask">
        {ASKS.map(ask => <Txt key={ask} style={{ marginBottom: SP.md }}>“{ask}”</Txt>)}
      </Section>

      <View style={{ marginTop: SP.xl, gap: SP.md }}>
        {!paired ? <Btn label="Connect this app to a server" onPress={() => router.push('/connect')} /> : null}
        <View style={{ alignItems: 'flex-start' }}>
          <Link label="Setup guide for the assistant" onPress={() => { void Linking.openURL(ASSISTANT_GUIDE_URL) }} />
        </View>
      </View>

      <Txt variant="label" dim style={{ marginTop: SP.xl, fontWeight: '400' }}>
        Nothing is sent to an AI company by this app. The assistant only sees your data if you set it up, on your own computer, against your own server.
      </Txt>
    </Screen>
  )
}
