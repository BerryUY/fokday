import { useState } from 'react';
import { View } from 'react-native';
import { MonthCalendar } from '@/components/calendar';
import { DayDetail } from '@/components/DayDetail';
import { Screen, TabHeader } from '@/components/ui/layout';
import { Card, Chip, Row, T } from '@/components/ui/primitives';
import { getMonthMarkers } from '@/data/history';
import { addDays, capitalize, formatLong, startOfMonth, todayKey, type DateKey } from '@/lib/dates';
import { useQuery } from '@/state/db';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export default function HistoryScreen() {
  const c = useColors();
  const today = todayKey();
  const [selected, setSelected] = useState<DateKey>(today);
  const [month, setMonth] = useState<DateKey>(today);
  const { data: markers } = useQuery((db) => getMonthMarkers(db, month), [month]);

  const select = (d: DateKey) => {
    setSelected(d);
    if (startOfMonth(d) !== startOfMonth(month)) setMonth(d);
  };

  return (
    <Screen tab>
      <TabHeader title="Historial" subtitle="Día por día" />
      <Row style={{ marginBottom: space.md, flexWrap: 'wrap' }}>
        <Chip label="Hoy" compact selected={selected === today} onPress={() => select(today)} />
        <Chip label="Ayer" compact selected={selected === addDays(today, -1)} onPress={() => select(addDays(today, -1))} />
        <Chip label="Hace una semana" compact selected={selected === addDays(today, -7)} onPress={() => select(addDays(today, -7))} />
      </Row>
      <Card>
        <MonthCalendar
          month={month}
          onChangeMonth={setMonth}
          selected={selected}
          onSelect={select}
          maxDate={today}
          marks={(d) => {
            const m = markers?.[d];
            if (!m) return undefined;
            return { dots: [m.meals ? c.accent : null, m.gym ? c.protein : null, m.weight ? c.weight : null].filter(Boolean) as string[] };
          }}
        />
        <Row gap={space.lg} style={{ justifyContent: 'center', marginTop: space.sm }}>
          <Legend color={c.accent} label="Comidas" />
          <Legend color={c.protein} label="Gym" />
          <Legend color={c.weight} label="Peso" />
        </Row>
      </Card>
      <T variant="title" style={{ marginTop: space.xl, marginBottom: space.lg }}>{capitalize(formatLong(selected))}</T>
      <DayDetail date={selected} />
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Row gap={6}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <T variant="caption" tone="dim">{label}</T>
    </Row>
  );
}
