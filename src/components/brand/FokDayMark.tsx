import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { MARK, MARK_SIZE } from '@/brand/mark';

export type MarkPiece = 'glow' | 'diamond' | 'middle' | 'top';

const c = MARK.colors;
const round = { strokeLinejoin: 'round' as const, strokeWidth: 5 };

/** One layer of the mark, full size, so layers can be stacked and animated on their own. */
export function MarkLayer({ piece, size, style }: { piece: MarkPiece; size: number; style?: StyleProp<ViewStyle> }) {
  const width = (size * MARK_SIZE.width) / MARK_SIZE.height;
  return (
    <View pointerEvents="none" style={[{ width, height: size }, style]}>
      <Svg width={width} height={size} viewBox={`0 0 ${MARK_SIZE.width} ${MARK_SIZE.height}`}>
        <Defs>
          <LinearGradient id="fd-top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.topFrom} />
            <Stop offset="1" stopColor={c.topTo} />
          </LinearGradient>
          <LinearGradient id="fd-mid" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.midFrom} />
            <Stop offset="1" stopColor={c.midTo} />
          </LinearGradient>
          <RadialGradient id="fd-glow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={c.glow} stopOpacity={0.45} />
            <Stop offset="1" stopColor={c.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {piece === 'glow' ? <Ellipse cx={60} cy={46} rx={58} ry={44} fill="url(#fd-glow)" /> : null}
        {piece === 'diamond' ? (
          <>
            <Polygon points={MARK.diamond} fill={c.diamond} stroke={c.diamond} {...round} />
            <Polygon points={MARK.inner} fill={c.inner} stroke={c.inner} opacity={0.45} {...round} />
          </>
        ) : null}
        {piece === 'middle' ? <Polygon points={MARK.middle} fill="url(#fd-mid)" stroke="url(#fd-mid)" {...round} /> : null}
        {piece === 'top' ? <Polygon points={MARK.top} fill="url(#fd-top)" stroke="url(#fd-top)" {...round} /> : null}
      </Svg>
    </View>
  );
}

/** The static FokDay mark. */
export function FokDayMark({ size = 96, glow = true }: { size?: number; glow?: boolean }) {
  const width = (size * MARK_SIZE.width) / MARK_SIZE.height;
  return (
    <View style={{ width, height: size }} accessibilityRole="image" accessibilityLabel="FokDay">
      {glow ? <MarkLayer piece="glow" size={size} style={StyleSheet.absoluteFill} /> : null}
      <MarkLayer piece="diamond" size={size} style={StyleSheet.absoluteFill} />
      <MarkLayer piece="middle" size={size} style={StyleSheet.absoluteFill} />
      <MarkLayer piece="top" size={size} style={StyleSheet.absoluteFill} />
    </View>
  );
}
