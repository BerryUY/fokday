import { useState } from 'react';
import { View } from 'react-native';
import { MonthCalendar } from '@/components/calendar';
import { Sheet } from '@/components/ui/form';
import { Button, Chip, Row } from '@/components/ui/primitives';
import { addDays, formatRelative, todayKey, type DateKey } from '@/lib/dates';
import { space } from '@/theme/tokens';

/** Chip that shows the chosen day ("Hoy", "Ayer", "Lunes 3 de marzo") and opens a calendar sheet. */
export function DateChip({ value, onChange, allowFuture = false }: { value: DateKey; onChange: (d: DateKey) => void; allowFuture?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Chip label={formatRelative(value)} icon="calendar" selected onPress={() => setOpen(true)} />
      <DatePickerSheet visible={open} value={value} onClose={() => setOpen(false)} onChange={onChange} allowFuture={allowFuture} />
    </>
  );
}

export function DatePickerSheet({ visible, value, onClose, onChange, allowFuture = false }: {
  visible: boolean;
  value: DateKey;
  onClose: () => void;
  onChange: (d: DateKey) => void;
  allowFuture?: boolean;
}) {
  const today = todayKey();
  const [month, setMonth] = useState(value);
  const pick = (d: DateKey) => {
    onChange(d);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Elegí el día">
      <Row style={{ marginBottom: space.lg, flexWrap: 'wrap' }}>
        <Chip label="Hoy" selected={value === today} onPress={() => pick(today)} />
        <Chip label="Ayer" selected={value === addDays(today, -1)} onPress={() => pick(addDays(today, -1))} />
        <Chip label="Anteayer" selected={value === addDays(today, -2)} onPress={() => pick(addDays(today, -2))} />
      </Row>
      <MonthCalendar month={month} onChangeMonth={setMonth} selected={value} onSelect={pick} maxDate={allowFuture ? undefined : today} />
      <View style={{ marginTop: space.lg }}>
        <Button label="Cerrar" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}
