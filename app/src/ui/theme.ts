import type { TextStyle } from 'react-native'

// The whole palette. Three colours and nothing else: black for the ground, white for what
// you read, dark green for what you press and what you have done. Hierarchy comes from the
// opacity of white, never from a fourth colour.
export const C = {
  black: '#000000',
  white: '#FFFFFF',
  green: '#14532D',
  /** secondary text */
  dim: 'rgba(255,255,255,0.62)',
  /** hints, placeholders, disabled */
  faint: 'rgba(255,255,255,0.36)',
  /** hairlines */
  line: 'rgba(255,255,255,0.14)',
  /** a pressed or resting surface that needs to lift off the ground */
  lift: 'rgba(255,255,255,0.06)',
} as const

export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36, xxxl: 56 } as const

export const RADIUS = 10

/** Content never grows wider than this on a tablet or a desktop browser. */
export const MAX_WIDTH = 560

export const TYPE: Record<'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'num', TextStyle> = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700', letterSpacing: -1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  num: { fontSize: 22, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'] },
}

export type TypeVariant = keyof typeof TYPE
