import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BODYPARTS, allExercises, buildPlannedEntry, defaultConfig, searchExercises,
  type Exercise, type Slot,
} from '@/engine'
import { cap } from '@/lib/text'
import { useStore } from '@/store/useStore'
import { useUI } from '@/store/useUI'
import { C, Chip, Icon, IconBtn, MAX_WIDTH, SP, Txt } from '@/ui'

/** The exercise library: search it, narrow it by body part, tap one to add it. */
export default function Pick() {
  const S = useStore(s => s.S)
  const target = useUI(s => s.pick)
  const [query, setQuery] = useState('')
  const [part, setPart] = useState<string | null>(null)

  const results = useMemo(() => {
    let list = allExercises(S)
    if (part) list = list.filter(e => e.bp === part)
    return query.trim() ? searchExercises(list, query) : list
  }, [S, query, part])

  const choose = (ex: Exercise) => {
    const slot: Slot = { id: ex.id, ...defaultConfig(ex.id) }
    if (target?.kind === 'routine') {
      useStore.getState().update(s => { s.routines.find(r => r.id === target.routineId)?.ex.push(slot) })
    } else if (target?.kind === 'active') {
      // Built the way a planned exercise is, so it opens at the weight you last used.
      const entry = { id: ex.id, ...buildPlannedEntry(S, slot, null) }
      useStore.getState().editActive(a => { a.entries.push(entry) })
    }
    useUI.getState().setPick(null)
    router.back()
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.column}>
        <View style={styles.searchRow}>
          <Icon name="search" size={20} color={C.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search 1,324 exercises"
            placeholderTextColor={C.faint}
            selectionColor={C.white}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.search}
            accessibilityLabel="Search exercises"
          />
          <IconBtn name="close" label="Close" onPress={() => router.back()} />
        </View>

        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            <Chip label="All" selected={!part} onPress={() => setPart(null)} />
            {BODYPARTS.map(bp => <Chip key={bp} label={cap(bp)} selected={part === bp} onPress={() => setPart(part === bp ? null : bp)} />)}
          </ScrollView>
        </View>

        <FlatList
          data={results}
          keyExtractor={e => e.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={7}
          contentContainerStyle={{ paddingBottom: SP.xxxl }}
          ListEmptyComponent={<Txt dim style={{ paddingVertical: SP.xl }}>Nothing matches. Try fewer words.</Txt>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Pressable
                onPress={() => choose(item)}
                style={({ pressed }) => [styles.itemMain, pressed && { opacity: 0.55 }]}
                accessibilityRole="button"
                accessibilityLabel={`Add ${item.n}`}
              >
                <Txt numberOfLines={1}>{cap(item.n)}</Txt>
                <Txt variant="label" dim numberOfLines={1} style={{ marginTop: 2, fontWeight: '400' }}>
                  {[item.bp, item.eq].filter(Boolean).map(v => cap(v as string)).join(' · ')}
                </Txt>
              </Pressable>
              <Pressable onPress={() => router.push(`/exercise/${item.id}`)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`About ${item.n}`} style={({ pressed }) => (pressed ? { opacity: 0.55 } : null)}>
                <Txt variant="label" faint>Info</Txt>
              </Pressable>
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.black },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SP.xl },
  searchRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: SP.md, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: C.line },
  search: { flex: 1, color: C.white, fontSize: 17, height: 44, outlineStyle: 'none' } as any,
  chips: { gap: SP.sm, paddingVertical: SP.md },
  item: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: SP.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  itemMain: { flex: 1, paddingVertical: SP.md },
})
