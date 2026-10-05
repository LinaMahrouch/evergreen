import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCoach, type Line as ChatLine } from '@/coach/useCoach'
import { useStore } from '@/store/useStore'
import { Btn, C, Field, Icon, Link, MAX_WIDTH, RADIUS, SP, Txt, confirm } from '@/ui'

const KEYS_URL = 'https://console.anthropic.com/settings/keys'

/** The coach: you say what you want, it reads your log and rewrites your plan. */
export default function Coach() {
  const { ready, hasKey, lines, busy, doing } = useCoach()
  const boot = useCoach(s => s.boot)
  const send = useCoach(s => s.send)
  const clear = useCoach(s => s.clear)
  const hasPlan = useStore(s => s.S.routines.length > 0)
  const [draft, setDraft] = useState('')
  const scroll = useRef<ScrollView>(null)

  useEffect(() => { void boot() }, [boot])

  const submit = (text = draft) => {
    if (!text.trim() || busy) return
    setDraft('')
    void send(text)
  }

  const startOver = async () => {
    if (await confirm('Start a new chat?', 'The coach forgets this conversation. Your plan and your log are not touched.', 'New chat')) clear()
  }

  const asks = hasPlan
    ? ['Look at my last month and fix what I have been neglecting.', 'I can only train three days this week. Rearrange it.', 'Make today\'s session shorter.']
    : ['Build me a four-day plan for building muscle.', 'I am new to the gym. Give me three simple days.', 'I only have dumbbells at home. Plan my week.']

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.column}>
            <View style={styles.head}>
              {lines.length && hasKey ? <Link label="New chat" onPress={() => { void startOver() }} /> : null}
            </View>
            <Txt variant="display">Coach</Txt>

            {!ready ? null : !hasKey ? <Setup /> : !lines.length ? (
              <View style={{ marginTop: SP.md }}>
                <Txt dim>Say what you want in your own words. The coach reads your plan and your log, and changes your routines and your week for you.</Txt>
                <View style={{ marginTop: SP.xl }}>
                  {asks.map(ask => (
                    <Pressable key={ask} onPress={() => submit(ask)} accessibilityRole="button" style={({ pressed }) => [styles.ask, pressed && { opacity: 0.55 }]}>
                      <Txt style={styles.fill}>{ask}</Txt>
                      <Icon name="chevron" size={18} color={C.faint} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={{ marginTop: SP.lg, gap: SP.lg }}>
                {lines.map(line => <Said key={line.id} line={line} />)}
              </View>
            )}
            {busy ? <Txt variant="label" dim style={{ marginTop: SP.lg }}>{doing}…</Txt> : null}
          </View>
        </ScrollView>

        {ready && hasKey ? (
          <View style={styles.composerBar}>
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask your coach"
                placeholderTextColor={C.faint}
                selectionColor={C.white}
                multiline
                accessibilityLabel="Message to your coach"
                style={[styles.input, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                // Enter sends on a keyboard that has a Shift key to make a new line with.
                onKeyPress={Platform.OS === 'web' ? (e: any) => { if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault(); submit() } } : undefined}
              />
              <Pressable
                onPress={() => submit()}
                disabled={busy || !draft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send"
                style={({ pressed }) => [styles.send, (busy || !draft.trim()) && { opacity: 0.35 }, pressed && { opacity: 0.55 }]}
              >
                <Icon name="up" size={20} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Said({ line }: { line: ChatLine }) {
  if (line.kind === 'you') {
    return <View style={styles.you}><Txt>{line.text}</Txt></View>
  }
  if (line.kind === 'change') {
    return (
      <View style={styles.change}>
        <View style={styles.dot}><Icon name="check" size={12} /></View>
        <Txt variant="label" style={styles.fill}>{line.text}</Txt>
      </View>
    )
  }
  if (line.kind === 'error') return <Txt variant="label" dim>{line.text}</Txt>
  return <Txt selectable>{line.text}</Txt>
}

/** Shown until there is a key: what the coach is, what it costs, where the key comes from. */
function Setup() {
  const setKey = useCoach(s => s.setKey)
  const [key, setKeyText] = useState('')
  const looksRight = key.trim().startsWith('sk-ant-') && key.trim().length > 30
  return (
    <View style={{ marginTop: SP.md }}>
      <Txt dim>
        Tell the coach what you want and it plans your training for you: it reads your log, writes your routines and sets your week.
      </Txt>
      <Txt dim style={{ marginTop: SP.md }}>
        It runs on Claude, with your own Anthropic API key. You pay Anthropic for what you use, usually a few cents a conversation.
      </Txt>

      <Txt variant="caption" dim style={{ marginTop: SP.xxl }}>Anthropic API key</Txt>
      <Field
        value={key}
        onChangeText={setKeyText}
        placeholder="sk-ant-…"
        secureTextEntry
        accessibilityLabel="Anthropic API key"
        onSubmitEditing={() => { if (looksRight) void setKey(key) }}
      />
      <View style={{ marginTop: SP.xl, gap: SP.md }}>
        <Btn label="Start" disabled={!looksRight} onPress={() => { void setKey(key) }} />
        <View style={{ alignItems: 'flex-start' }}>
          <Link label="Get a key at console.anthropic.com" onPress={() => { void Linking.openURL(KEYS_URL) }} />
        </View>
      </View>

      <Txt variant="label" dim style={{ marginTop: SP.xl, fontWeight: '400' }}>
        The key is kept on this device only. What you write, and your plan and log, go from this device straight to Anthropic and nowhere else.
      </Txt>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.black },
  fill: { flex: 1 },
  body: { flexGrow: 1, paddingBottom: SP.xl },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SP.xl },
  head: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  ask: { minHeight: 60, paddingVertical: SP.md, flexDirection: 'row', alignItems: 'center', gap: SP.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  you: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: C.lift, borderRadius: RADIUS, paddingHorizontal: SP.lg, paddingVertical: SP.md },
  change: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  dot: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  composerBar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.black },
  composer: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SP.xl, paddingVertical: SP.md, flexDirection: 'row', alignItems: 'flex-end', gap: SP.md },
  input: { flex: 1, minHeight: 44, maxHeight: 140, color: C.white, fontSize: 16, lineHeight: 22, paddingVertical: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
})
