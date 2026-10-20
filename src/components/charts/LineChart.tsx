import { useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { T } from '@/components/ui/primitives';
import { diffDays, formatShort, type DateKey } from '@/lib/dates';
import { useColors } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

export type LinePoint = { date: DateKey; value: number };

/**
 * Time-scaled line chart: points are spaced by real calendar distance, so gaps
 * in logging look like gaps. Touch and drag to inspect any point.
 */
export function LineChart({ data, secondary, target, color, height = 180, formatValue, unit, emptyLabel = 'Sin datos todavía' }: {
  data: LinePoint[];
  secondary?: LinePoint[];
  target?: number | null;
  color: string;
  height?: number;
  formatValue: (v: number) => string;
  unit?: string;
  emptyLabel?: string;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const pad = { top: 14, bottom: 24, left: 8, right: 40 };

  const geo = useMemo(() => {
    if (data.length === 0 || width === 0) return null;
    const first = data[0].date;
    const span = Math.max(1, diffDays(first, data[data.length - 1].date));
    const values = [...data.map((d) => d.value), ...(secondary ?? []).map((d) => d.value), ...(target ? [target] : [])];
    let min = Math.min(...values);
    let max = Math.max(...values);
    const range = Math.max(max - min, 1);
    min -= range * 0.12;
    max += range * 0.12;
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const x = (date: DateKey) => pad.left + (data.length === 1 ? w / 2 : (diffDays(first, date) / span) * w);
    const y = (v: number) => pad.top + (1 - (v - min) / (max - min)) * h;
    const toPath = (pts: LinePoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const line = toPath(data);
    const area = data.length > 1 ? `${line} L${x(data[data.length - 1].date).toFixed(1)},${pad.top + h} L${x(first).toFixed(1)},${pad.top + h} Z` : '';
    const ticks = [max - (max - min) * 0.12, (max + min) / 2, min + (max - min) * 0.12];
    return { x, y, line, area, second: secondary && secondary.length > 1 ? toPath(secondary) : null, ticks, h, w };
  }, [data, secondary, target, width, height]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const pick = (e: GestureResponderEvent) => {
    if (!geo) return;
    const lx = e.nativeEvent.locationX;
    let best = 0;
    let bestDist = Infinity;
    data.forEach((p, i) => {
      const d = Math.abs(geo.x(p.date) - lx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setSelected(best);
  };

  const active = data[selected ?? data.length - 1];

  return (
    <View>
      {active ? (
        <View style={styles.readout}>
          <T variant="number" color={color}>{formatValue(active.value)}{unit ? <T variant="label" tone="dim">{` ${unit}`}</T> : null}</T>
          <T variant="caption" tone="dim">{selected === null ? `Último · ${formatShort(active.date)}` : formatShort(active.date)}</T>
        </View>
      ) : null}
      <View
        onLayout={onLayout}
        style={{ height }}
        onStartShouldSetResponder={() => data.length > 0}
        onMoveShouldSetResponder={() => data.length > 0}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderRelease={() => setTimeout(() => setSelected(null), 1600)}
      >
        {data.length === 0 ? (
          <View style={[styles.empty, { borderColor: c.border }]}>
            <T variant="label" tone="dim">{emptyLabel}</T>
          </View>
        ) : geo ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {geo.ticks.map((t, i) => (
              <SvgText key={i} x={width - 4} y={geo.y(t) + 4} fill={c.textDim} fontSize={10} fontFamily={font.medium} textAnchor="end">
                {formatValue(t)}
              </SvgText>
            ))}
            {target ? (
              <>
                <Line x1={pad.left} x2={pad.left + geo.w} y1={geo.y(target)} y2={geo.y(target)} stroke={c.textDim} strokeDasharray="4 5" strokeWidth={1} />
              </>
            ) : null}
            {geo.area ? <Path d={geo.area} fill="url(#fill)" /> : null}
            {geo.second ? <Path d={geo.second} stroke={c.text} strokeOpacity={0.45} strokeWidth={1.5} fill="none" strokeDasharray="2 4" /> : null}
            <Path d={geo.line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {data.length <= 40 && data.map((p) => <Circle key={p.date} cx={geo.x(p.date)} cy={geo.y(p.value)} r={2.5} fill={color} />)}
            {active ? (
              <>
                <Line x1={geo.x(active.date)} x2={geo.x(active.date)} y1={pad.top} y2={pad.top + geo.h} stroke={c.textDim} strokeWidth={1} />
                <Circle cx={geo.x(active.date)} cy={geo.y(active.value)} r={6} fill={c.bg} stroke={color} strokeWidth={2.5} />
              </>
            ) : null}
            <SvgText x={pad.left} y={height - 6} fill={c.textDim} fontSize={10} fontFamily={font.medium}>{formatShort(data[0].date)}</SvgText>
            {data.length > 1 ? (
              <SvgText x={pad.left + geo.w} y={height - 6} fill={c.textDim} fontSize={10} fontFamily={font.medium} textAnchor="end">
                {formatShort(data[data.length - 1].date)}
              </SvgText>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  empty: { flex: 1, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
