// A backup is the profile as one JSON file — the same document an openGym server stores, so a
// file exported here imports there and the other way round.
import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'
import { todayISO, type State } from '@/engine'

export async function exportBackup(S: State): Promise<void> {
  const { active: _active, _rev: _r, ...doc } = S
  const json = JSON.stringify(doc)
  const name = `evergreen-backup-${todayISO()}.json`

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  const file = new File(Paths.cache, name)
  if (file.exists) file.delete()
  file.create()
  file.write(json)
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your backup', UTI: 'public.json' })
}

/** Lets the user pick a backup file. Resolves to null when they cancel. Throws on a file that is not one. */
export async function pickBackup(): Promise<Partial<State> | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true })
  if (res.canceled || !res.assets?.length) return null
  const asset = res.assets[0]
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text()
  let doc: any
  try { doc = JSON.parse(text) } catch { throw new Error('That file is not a backup: it is not JSON.') }
  // openGym's export wraps nothing; an older one may sit under `state`.
  const state = doc && typeof doc === 'object' && doc.state && typeof doc.state === 'object' ? doc.state : doc
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('That file is not a backup.')
  const s = state as Partial<State>
  if (!Array.isArray(s.routines) && !Array.isArray(s.workouts) && !Array.isArray(s.bodyweight)) {
    throw new Error('That file has no routines, workouts or weigh-ins in it.')
  }
  return s
}
