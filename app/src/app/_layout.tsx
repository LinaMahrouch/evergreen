import { Stack } from 'expo-router/stack'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { AppState, Platform, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useStore } from '@/store/useStore'
import { C } from '@/ui'

/** While the app is open and paired, ask the server every half minute whether anything moved. */
function useSyncLoop() {
  const paired = useStore(s => !!s.remote)
  useEffect(() => {
    if (!paired) return
    const tick = () => { if (AppState.currentState === 'active') void useStore.getState().sync() }
    const timer = setInterval(tick, 30_000)
    const sub = AppState.addEventListener('change', state => { if (state === 'active') tick() })
    return () => { clearInterval(timer); sub.remove() }
  }, [paired])
}

export default function RootLayout() {
  const ready = useStore(s => s.ready)
  useEffect(() => { void useStore.getState().boot() }, [])
  useEffect(() => {
    // The page behind the app is the browser's, and white by default.
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = C.black
      document.body.style.backgroundColor = C.black
    }
  }, [])
  useSyncLoop()

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: C.black }}>
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.black } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="workout" options={{ gestureEnabled: false }} />
            <Stack.Screen name="pick" options={{ presentation: 'modal' }} />
            <Stack.Screen name="weigh" options={{ presentation: 'modal' }} />
            <Stack.Screen name="starter" options={{ presentation: 'modal' }} />
            <Stack.Screen name="day/[d]" options={{ presentation: 'modal' }} />
          </Stack>
        ) : null}
      </View>
    </SafeAreaProvider>
  )
}
