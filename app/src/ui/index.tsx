// Every screen is built from the pieces in this file. There is no component library under
// them: a minimal design is easier to keep minimal when the whole vocabulary fits on one page.
import { router } from 'expo-router'
import { useState, type ReactNode } from 'react'
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icon, type IconName } from './Icon'
import { C, MAX_WIDTH, RADIUS, SP, TYPE, type TypeVariant } from './theme'

export { C, SP, RADIUS, MAX_WIDTH } from './theme'
export { Icon } from './Icon'

/* ---------- text ---------- */

export function Txt({
  variant = 'body', dim, faint, center, style, ...rest
}: TextProps & { variant?: TypeVariant; dim?: boolean; faint?: boolean; center?: boolean }) {
  return (
    <Text
      {...rest}
      style={[
        TYPE[variant],
        { color: faint ? C.faint : dim ? C.dim : C.white },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  )
}

/* ---------- layout ---------- */

/** A full-height black page. `scroll` makes the body scroll; `footer` stays pinned under it. */
export function Screen({
  children, scroll = true, footer, edges = ['top', 'left', 'right'],
}: { children: ReactNode; scroll?: boolean; footer?: ReactNode; edges?: ('top' | 'bottom' | 'left' | 'right')[] }) {
  const body = <View style={styles.column}>{children}</View>
  return (
    <SafeAreaView style={styles.screen} edges={footer ? [...edges, 'bottom'] : edges}>
      {/* Lifts the page clear of the on-screen keyboard, so a field low on the page can be scrolled into view. */}
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{body}</View>
      )}
      {footer ? <View style={styles.footer}><View style={styles.footerInner}>{footer}</View></View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** The bar on top of a pushed screen: back, a short title, one optional action. */
export function TopBar({ title, right, onBack, close }: { title?: string; right?: ReactNode; onBack?: () => void; close?: boolean }) {
  const back = onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')))
  return (
    <View style={styles.topBar}>
      <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel={close ? 'Close' : 'Back'} style={pressed}>
        <Icon name={close ? 'close' : 'back'} />
      </Pressable>
      {title ? <Txt variant="label" dim numberOfLines={1} style={styles.topTitle}>{title}</Txt> : <View style={styles.fill} />}
      <View style={styles.topRight}>{right}</View>
    </View>
  )
}

export function Section({ label, right, children, first }: { label?: string; right?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <View style={{ marginTop: first ? SP.lg : SP.xxl }}>
      {label ? (
        <View style={styles.sectionHead}>
          <Txt variant="caption" dim>{label}</Txt>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export const Line = () => <View style={styles.line} />

/* ---------- controls ---------- */

const pressed = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.55 } : null)

export function Btn({
  label, onPress, kind = 'primary', disabled, small, style, icon,
}: {
  label: string
  onPress: () => void
  /** primary: green fill. outline: white hairline. plain: just the words. */
  kind?: 'primary' | 'outline' | 'plain'
  disabled?: boolean
  small?: boolean
  style?: StyleProp<ViewStyle>
  icon?: IconName
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={state => [
        styles.btn,
        small && styles.btnSmall,
        kind === 'primary' && { backgroundColor: C.green },
        kind === 'outline' && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: C.white },
        kind === 'plain' && { paddingHorizontal: 0, minHeight: 36 },
        disabled && { opacity: 0.35 },
        pressed(state),
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      <Txt variant="label" style={small ? null : { fontSize: 16, fontWeight: '600' }}>{label}</Txt>
    </Pressable>
  )
}

/** A text action: quiet, underlined by nothing, used for secondary things. */
export function Link({ label, onPress, dim = true }: { label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={pressed}>
      <Txt variant="label" dim={dim}>{label}</Txt>
    </Pressable>
  )
}

export function IconBtn({ name, onPress, label, size = 22, color }: { name: IconName; onPress: () => void; label: string; size?: number; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={pressed}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  )
}

/** One line in a list: what it is, an optional second line, an optional value on the right. */
export function Row({
  title, subtitle, value, onPress, chevron, left, right, strong,
}: {
  title: string
  subtitle?: string
  value?: string
  onPress?: () => void
  chevron?: boolean
  left?: ReactNode
  right?: ReactNode
  strong?: boolean
}) {
  const inner = (
    <View style={styles.row}>
      {left}
      <View style={styles.fill}>
        <Txt variant={strong ? 'heading' : 'body'} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="label" dim numberOfLines={2} style={{ marginTop: 2, fontWeight: '400' }}>{subtitle}</Txt> : null}
      </View>
      {value ? <Txt variant="body" dim numberOfLines={1}>{value}</Txt> : null}
      {right}
      {chevron && onPress ? <Icon name="chevron" size={18} color={C.faint} /> : null}
    </View>
  )
  return (
    <View>
      {onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={pressed}>{inner}</Pressable> : inner}
      <Line />
    </View>
  )
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={state => [styles.chip, selected ? { backgroundColor: C.white, borderColor: C.white } : null, pressed(state)]}
    >
      <Txt variant="label" style={{ color: selected ? C.black : C.dim }}>{label}</Txt>
    </Pressable>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map(o => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: C.white }]}
          >
            <Txt variant="label" style={{ color: on ? C.black : C.dim }}>{o.label}</Txt>
          </Pressable>
        )
      })}
    </View>
  )
}

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null

export function Field({ style, ...rest }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={C.faint}
      selectionColor={C.white}
      autoCapitalize="none"
      autoCorrect={false}
      {...rest}
      style={[styles.field, webNoOutline, style]}
    />
  )
}

/** Parses what someone typed into a number field: a comma is a decimal point, junk is nothing. */
export function parseNum(text: string): number | null {
  const n = Number(String(text).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * A number you can nudge or type. Shows the value between − and +; tapping the value turns it
 * into a text field. `format` is how it reads at rest.
 */
export function Stepper({
  label, value, onChange, step = 1, min = 0, max = 9999, format, suffix,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  format?: (v: number) => string
  suffix?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  const commit = () => {
    if (draft != null) {
      const n = parseNum(draft)
      if (n != null) onChange(clamp(n))
    }
    setDraft(null)
  }
  const shown = format ? format(value) : String(value)
  // A unit after a word ("Auto kg", "None kg") reads wrong; it belongs to a number only.
  const unit = suffix && /[0-9]/.test(shown) ? suffix : null
  return (
    <View style={styles.stepper}>
      <Txt variant="body" style={styles.fill}>{label}</Txt>
      <Pressable onPress={() => onChange(clamp(value - step))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Less ${label}`} style={state => [styles.stepBtn, pressed(state)]}>
        <Icon name="minus" size={18} />
      </Pressable>
      {draft != null ? (
        <TextInput
          autoFocus
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          selectTextOnFocus
          selectionColor={C.white}
          style={[styles.stepValue, TYPE.num, { color: C.white }, webNoOutline]}
        />
      ) : (
        <Pressable onPress={() => setDraft(String(value))} accessibilityRole="button" accessibilityLabel={`${label}: ${shown}${unit ? ' ' + unit : ''}. Tap to type.`}>
          <Text style={[styles.stepValue, TYPE.num, { color: C.white }]} numberOfLines={1}>
            {shown}
            {unit ? <Text style={{ fontSize: 13, fontWeight: '400', color: C.dim }}> {unit}</Text> : null}
          </Text>
        </Pressable>
      )}
      <Pressable onPress={() => onChange(clamp(value + step))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={state => [styles.stepBtn, pressed(state)]}>
        <Icon name="plus" size={18} />
      </Pressable>
    </View>
  )
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Txt variant="heading">{title}</Txt>
      {body ? <Txt dim style={{ marginTop: SP.sm }}>{body}</Txt> : null}
      {children ? <View style={{ marginTop: SP.xl, gap: SP.md }}>{children}</View> : null}
    </View>
  )
}

/* ---------- dialogs ---------- */

/** Yes/no, the platform's own way: an alert on a phone, the browser's confirm on the web. */
export function confirm(title: string, message: string, okLabel = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(message ? `${title}\n\n${message}` : title))
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  })
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title); return }
  Alert.alert(title, message)
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.black },
  fill: { flex: 1 },
  scrollBody: { flexGrow: 1, paddingBottom: SP.xxxl },
  column: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SP.xl, flexGrow: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.black },
  footerInner: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SP.xl, paddingVertical: SP.md, gap: SP.sm },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', gap: SP.lg },
  topTitle: { flex: 1, textAlign: 'center' },
  topRight: { minWidth: 22, alignItems: 'flex-end' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.sm },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: C.line },
  btn: { minHeight: 52, borderRadius: RADIUS, paddingHorizontal: SP.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP.sm },
  btnSmall: { minHeight: 38, paddingHorizontal: SP.lg },
  row: { minHeight: 60, paddingVertical: SP.md, flexDirection: 'row', alignItems: 'center', gap: SP.md },
  chip: { height: 34, paddingHorizontal: SP.lg, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: RADIUS, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: C.line, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 36, borderRadius: RADIUS - 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.sm },
  field: { minHeight: 52, color: C.white, fontSize: 17, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: C.line, paddingVertical: SP.sm },
  stepper: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: SP.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 88, textAlign: 'center', paddingVertical: 0 },
  empty: { paddingVertical: SP.xxxl },
})
