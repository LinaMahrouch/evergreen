import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import type { Exercise } from '@/engine'
import { MEDIA_BASE } from '@/lib/config'
import { usePrefs } from '@/store/usePrefs'
import { RADIUS } from './theme'

/**
 * The picture of an exercise: the looping animation (`kind="motion"`) or its still thumbnail.
 *
 * The files are not part of this app and not covered by its licence (see ../../NOTICE.md in
 * the repository): they are loaded over the network from the exercise dataset openGym uses,
 * and Settings can switch them off. With them off, with no connection, or for an exercise
 * that has none (the person's own), this renders nothing and the screen reads fine without it.
 */
export function ExerciseMedia({ ex, kind, size }: { ex: Exercise; kind: 'motion' | 'still'; size: number }) {
  const on = usePrefs(s => s.animations)
  const file = kind === 'motion' ? ex.gif : ex.img
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [file])
  if (!on || !file || failed) return null
  const uri = MEDIA_BASE + (kind === 'motion' ? 'videos/' : 'images/') + file
  return (
    // The drawings are made for a white page, so they get one.
    <View style={{ width: size, height: size, borderRadius: kind === 'motion' ? RADIUS : RADIUS - 4, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit="contain"
        autoplay
        cachePolicy="disk"
        accessibilityLabel={kind === 'motion' ? `How ${ex.n} is done` : undefined}
        onError={() => setFailed(true)}
      />
    </View>
  )
}
