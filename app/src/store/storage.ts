// Where the app keeps things on the device. The profile is JSON in AsyncStorage (localStorage
// in a browser); the server token goes to the platform keychain where there is one.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export const KEYS = {
  state: 'evergreen.state.v1',
  active: 'evergreen.active.v1',
  meta: 'evergreen.meta.v1',
  remote: 'evergreen.remote.v1',
  token: 'evergreen.token.v1',
  coach: 'evergreen.coach.v1',
  prefs: 'evergreen.prefs.v1',
  coachKey: 'evergreen.coach.key.v1',
} as const

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Returns false when the write was refused (a full disk, a private-mode browser). */
export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    if (value == null) await AsyncStorage.removeItem(key)
    else await AsyncStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// The keychain is native-only; a browser has nothing better than its own storage.
const secure = Platform.OS !== 'web'

export async function readToken(): Promise<string | null> {
  try {
    return secure ? await SecureStore.getItemAsync(KEYS.token) : await AsyncStorage.getItem(KEYS.token)
  } catch {
    return null
  }
}

export async function writeToken(token: string | null): Promise<void> {
  try {
    if (secure) {
      if (token) await SecureStore.setItemAsync(KEYS.token, token)
      else await SecureStore.deleteItemAsync(KEYS.token)
    } else if (token) await AsyncStorage.setItem(KEYS.token, token)
    else await AsyncStorage.removeItem(KEYS.token)
  } catch { /* the pairing then lasts until the app closes; pairing again fixes it */ }
}

/** Any other secret (the coach's API key): the keychain on a phone, the browser's storage on the web. */
export async function readSecret(key: string): Promise<string | null> {
  try {
    return secure ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key)
  } catch {
    return null
  }
}

export async function writeSecret(key: string, value: string | null): Promise<void> {
  try {
    if (secure) {
      if (value) await SecureStore.setItemAsync(key, value)
      else await SecureStore.deleteItemAsync(key)
    } else if (value) await AsyncStorage.setItem(key, value)
    else await AsyncStorage.removeItem(key)
  } catch { /* it then lasts until the app closes; entering it again fixes it */ }
}
