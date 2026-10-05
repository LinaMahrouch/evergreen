import Svg, { Path, Circle } from 'react-native-svg'
import { C } from './theme'

// A handful of line icons drawn on a 24 grid, 1.75 stroke, no fills. Kept to what the app
// actually needs — words do the rest of the work.
const PATHS = {
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 14l6-6 6 6',
  down: 'M6 10l6 6 6-6',
  search: 'M16.5 16.5L21 21',
  more: '',
  gear: 'M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 00-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 007 6.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 002.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 002.6-1.5l2.4 1 2-3.5z',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, color = C.white }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'search' && <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={1.75} />}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={19} cy={12} r={1.6} fill={color} />
        </>
      )}
      {PATHS[name] ? (
        <Path d={PATHS[name]} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </Svg>
  )
}
