import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { IconButton, T } from '@/components/ui/primitives';
import {
  addDays,
  addMonths,
  DAY_LETTER,
  diffDays,
  endOfMonth,
  formatMonth,
  MONTHS_SHORT,
  startOfMonth,
  startOfWeek,
  todayKey,
  weekday,
  WEEK_ORDER,
  type DateKey,
} from '@/lib/dates';
import { useColors } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

export type DayMark = {
  /** Strong fill (e.g. attended the gym). */
  filled?: boolean;
  /** Dashed outline: a planned training day. */
  planned?: boolean;
  /** Small colored dots under the number. */
  dots?: string[];
};

/** Monday-first month grid with month navigation. */
export function MonthCalendar({ month, onChangeMonth, selected, onSelect, marks, maxDate }: {
  month: DateKey;
  onChangeMonth: (month: DateKey) => void;
  selected?: DateKey | null;
  onSelect?: (date: DateKey) => void;
  marks?: (date: DateKey) => DayMark | undefined;
  maxDate?: DateKey;
}) {
  const c = useColors();
  const today = todayKey();
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((diffDays(gridStart, last) + 1) / 7);
  const canGoNext = !maxDate || addMonths(first, 1) <= maxDate;

  return (
    <View>
      <View style={styles.monthHeader}>
        <IconButton icon="chevron-left" label="Mes anterior" size={36} onPress={() => onChangeMonth(addMonths(first, -1))} />
        <T variant="h3">{formatMonth(first)}</T>
        <IconButton
          icon="chevron-right"
          label="Mes siguiente"
          size={36}
          onPress={canGoNext ? () => onChangeMonth(addMonths(first, 1)) : undefined}
          style={!canGoNext && { opacity: 0.3 }}
        />
      </View>
      <View style={styles.weekRow}>
        {WEEK_ORDER.map((wd) => (
          <T key={wd} variant="caption" tone="dim" style={styles.weekLetter}>{DAY_LETTER[wd]}</T>
        ))}
      </View>
      {Array.from({ length: weeks }, (_, w) => (
        <View key={w} style={styles.weekRow}>
          {Array.from({ length: 7 }, (_, d) => {
            const date = addDays(gridStart, w * 7 + d);
            const inMonth = date >= first && date <= last;
            const disabled = !!maxDate && date > maxDate;
            const mark = inMonth ? marks?.(date) : undefined;
            const isSelected = selected === date;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                disabled={!inMonth || disabled || !onSelect}
                onPress={() => onSelect?.(date)}
                style={styles.cell}
                accessibilityLabel={date}
              >
                {inMonth ? (
                  <View
                    style={[
                      styles.day,
                      mark?.planned && !mark?.filled && { borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed' },
                      mark?.filled && { backgroundColor: c.accent },
                      isSelected && !mark?.filled && { backgroundColor: c.surfacePressed },
                      isSelected && { borderWidth: 2, borderColor: c.text, borderStyle: 'solid' },
                    ]}
                  >
                    <T
                      variant="label"
                      style={{ fontFamily: isToday ? font.heavy : font.medium, opacity: disabled ? 0.3 : 1 }}
                      color={mark?.filled ? c.accentText : isToday ? c.accent : c.text}
                    >
                      {Number(date.slice(8))}
                    </T>
                    {mark?.dots?.length ? (
                      <View style={styles.dots}>
                        {mark.dots.slice(0, 3).map((color, i) => (
                          <View key={i} style={[styles.dot, { backgroundColor: mark.filled ? c.accentText : color }]} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Current week strip for the dashboard. */
export function WeekStrip({ attended, planned, today }: { attended: Set<DateKey>; planned: number[]; today: DateKey }) {
  const c = useColors();
  const start = startOfWeek(today);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        const done = attended.has(date);
        const isPlanned = planned.includes(weekday(date));
        const isToday = date === today;
        return (
          <View key={date} style={{ alignItems: 'center', gap: 6 }}>
            <T variant="caption" tone={isToday ? 'default' : 'dim'}>{DAY_LETTER[weekday(date)]}</T>
            <View
              style={[
                styles.weekDot,
                { backgroundColor: done ? c.accent : c.surfaceAlt },
                !done && isPlanned && { borderWidth: 1.5, borderColor: date < today ? c.textDim : c.accent, borderStyle: 'dashed' },
                isToday && !done && { borderStyle: 'solid', borderColor: c.text, borderWidth: 1.5 },
              ]}
            >
              {done ? (
                <Feather name="check" size={15} color={c.accentText} />
              ) : (
                <T variant="caption" tone={isToday ? 'default' : 'dim'}>{Number(date.slice(8))}</T>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** GitHub-style year of training days. Scrolls to the current week. */
export function YearHeatmap({ attended, today, cell = 13 }: { attended: Set<DateKey>; today: DateKey; cell?: number }) {
  const c = useColors();
  const gap = 3;
  const end = today;
  const start = startOfWeek(addDays(end, -7 * 52));
  const columns = Math.ceil((diffDays(start, end) + 1) / 7);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const monthLabels = useMemo(() => {
    const labels: { col: number; text: string }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < columns; col++) {
      const m = Number(addDays(start, col * 7).slice(5, 7)) - 1;
      if (m !== lastMonth) {
        labels.push({ col, text: MONTHS_SHORT[m] });
        lastMonth = m;
      }
    }
    return labels.filter((l, i) => i === 0 || l.col - labels[i - 1].col >= 3);
  }, [start, columns]);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ marginTop: 18, marginRight: 6, gap }}>
        {WEEK_ORDER.map((wd, i) => (
          <T key={wd} variant="caption" tone="dim" style={{ height: cell, fontSize: 9, lineHeight: cell }}>{i % 2 === 0 ? DAY_LETTER[wd] : ''}</T>
        ))}
      </View>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ height: 18, flexDirection: 'row' }}>
            {monthLabels.map((l) => (
              <T key={l.col} variant="caption" tone="dim" style={{ position: 'absolute', left: l.col * (cell + gap), fontSize: 10 }}>{l.text}</T>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap }}>
            {Array.from({ length: columns }, (_, col) => (
              <View key={col} style={{ gap }}>
                {Array.from({ length: 7 }, (_, row) => {
                  const date = addDays(start, col * 7 + row);
                  if (date > end) return <View key={row} style={{ width: cell, height: cell }} />;
                  return (
                    <View
                      key={row}
                      style={{
                        width: cell,
                        height: cell,
                        borderRadius: 3,
                        backgroundColor: attended.has(date) ? c.heat[3] : c.heat[0],
                        borderWidth: date === today ? 1 : 0,
                        borderColor: c.text,
                      }}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  weekRow: { flexDirection: 'row' },
  weekLetter: { flex: 1, textAlign: 'center', marginBottom: 6 },
  cell: { flex: 1, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 2, position: 'absolute', bottom: 5 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  weekDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
