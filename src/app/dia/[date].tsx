import { DayDetail } from '@/components/DayDetail';
import { Screen } from '@/components/ui/layout';
import { capitalize, formatLong } from '@/lib/dates';
import { useParams } from '@/lib/params';

export default function DayScreen() {
  const date = useParams().date();
  return (
    <Screen title={capitalize(formatLong(date))}>
      <DayDetail date={date} />
    </Screen>
  );
}
