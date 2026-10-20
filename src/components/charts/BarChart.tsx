import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { T } from '@/components/ui/primitives';
import { useColors } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

export type Bar = { key: string; label: string; value: number | null; goal?: number | null; detail?: string };

/**
 * Bars with an optional per-bar goal tick. `null` values are drawn as a hollow
 * dot on the baseline: "no data" is visibly different from a recorded zero.
 */
export function BarChart({ data, color, height = 160, formatValue, showEveryLabel = 1, emptyLabel = 'Sin datos en este período' }: {
  data: Bar[];
  color: string;
  height?: number;
  formatValue: (v: number) => string;
  showEveryLabel?: number;
  emptyLabel?: string;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const pad = { top: 10, bottom: 20 };
  const hasData = data.some((d) => d.value !== null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.value ?? 0, d.goal ?? 0))) * 1.08;
  const h = height - pad.top - pad.bottom;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.max(3, Math.min(28, slot * 0.62));
  const y = (v: number) => pad.top + (1 - v / max) * h;
  const sel = selected !== null ? data[selected] : null;

  return (
    <View>
      <View style={styles.readout}>
        {sel ? (
          <>
            <T variant="label">{sel.label}</T>
            <T variant="label" color={sel.value === null ? c.textDim : color}>
              {sel.value === null ? 'Sin registros' : sel.detail ?? formatValue(sel.value)}
            </T>
          </>
        ) : (
          <T variant="caption" tone="dim">Tocá una barra para ver el detalle</T>
        )}
      </View>
      <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {!hasData ? (
          <View style={[styles.empty, { borderColor: c.border }]}>
            <T variant="label" tone="dim">{emptyLabel}</T>
          </View>
        ) : width > 0 ? (
          <>
            <Svg width={width} height={height}>
              <Line x1={0} x2={width} y1={pad.top + h} y2={pad.top + h} stroke={c.border} strokeWidth={1} />
              {data.map((d, i) => {
                const cx = slot * i + slot / 2;
                const active = selected === i;
                return (
                  <G key={d.key}>
                    {d.value === null ? (
                      <Circle cx={cx} cy={pad.top + h - 4} r={2.5} stroke={c.textDim} strokeWidth={1} fill="none" />
                    ) : (
                      <Rect
                        x={cx - barW / 2}
                        y={y(d.value)}
                        width={barW}
                        height={Math.max(2, pad.top + h - y(d.value))}
                        rx={Math.min(6, barW / 2)}
                        fill={color}
                        opacity={selected === null || active ? 1 : 0.4}
                      />
                    )}
                    {d.goal ? (
                      <Line x1={cx - barW / 2 - 2} x2={cx + barW / 2 + 2} y1={y(d.goal)} y2={y(d.goal)} stroke={c.text} strokeOpacity={0.5} strokeWidth={1.5} />
                    ) : null}
                    {i % showEveryLabel === 0 ? (
                      <SvgText x={cx} y={height - 5} fill={active ? c.text : c.textDim} fontSize={10} fontFamily={font.medium} textAnchor="middle">
                        {d.label.length > 6 ? d.label.slice(0, 6) : d.label}
                      </SvgText>
                    ) : null}
                  </G>
                );
              })}
            </Svg>
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              {data.map((d, i) => (
                <Pressable
                  key={d.key}
                  style={{ flex: 1 }}
                  onPress={() => setSelected(selected === i ? null : i)}
                  accessibilityLabel={`${d.label}: ${d.value === null ? 'sin registros' : formatValue(d.value)}`}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, minHeight: 18 },
  empty: { flex: 1, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
