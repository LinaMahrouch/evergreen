import { Tabs } from 'expo-router/tabs'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, MAX_WIDTH, Txt } from '@/ui'

const TABS = [
  { name: 'index', label: 'Today' },
  { name: 'plan', label: 'Plan' },
  { name: 'coach', label: 'Coach' },
  { name: 'history', label: 'Log' },
  { name: 'progress', label: 'Progress' },
] as const

// Words instead of icons: five destinations are few enough to read.
function TabBar({ state, navigation }: { state: { index: number; routes: { key: string; name: string }[] }; navigation: any }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.inner}>
        {state.routes.map((route, i) => {
          const tab = TABS.find(t => t.name === route.name)
          if (!tab) return null
          const on = state.index === i
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!on && !event.defaultPrevented) navigation.navigate(route.name)
              }}
            >
              <View style={[styles.mark, on && { backgroundColor: C.white }]} />
              <Txt variant="label" style={{ color: on ? C.white : C.faint, fontWeight: on ? '600' : '500' }}>{tab.label}</Txt>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.black } }}
      tabBar={props => <TabBar {...(props as any)} />}
    >
      {TABS.map(t => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />)}
    </Tabs>
  )
}

const styles = StyleSheet.create({
  bar: { backgroundColor: C.black, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  inner: { flexDirection: 'row', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  tab: { flex: 1, alignItems: 'center', paddingBottom: 6, gap: 10 },
  mark: { height: 2, width: 24, backgroundColor: 'transparent' },
})
