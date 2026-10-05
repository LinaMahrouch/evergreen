import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Circle, Line as SvgLine, Polyline } from 'react-native-svg'
import { C } from './theme'
import { Txt } from './index'

/**
 * A single white line on black with its last point marked, the range it spans written at the
 * side, and an optional dashed goal. Nothing else: no grid, no axes, no legend.
 */
export function LineChart({
  points, goal, height = 120, format = v => String(v),
}: { points: number[]; goal?: number | null; height?: number; format?: (v: number) => string }) {
  const [width, setWidth] = useState(0)
  if (points.length < 2) return null
  const values = goal != null ? [...points, goal] : points
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pad = 6
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2)
  const last = points.length - 1
  return (
    <View>
      <View style={{ height }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {goal != null ? (
              <SvgLine x1={pad} x2={width - pad} y1={y(goal)} y2={y(goal)} stroke={C.white} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 5" />
            ) : null}
            <Polyline
              points={points.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none" stroke={C.white} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
            />
            <Circle cx={x(last)} cy={y(points[last])} r={5} fill={C.green} stroke={C.white} strokeWidth={1.75} />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Txt variant="label" faint>{format(lo)}</Txt>
        <Txt variant="label" faint>{format(hi)}</Txt>
      </View>
    </View>
  )
}
