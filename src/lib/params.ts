import { useLocalSearchParams } from 'expo-router';
import { isMealCategory, type MealCategory } from '@/domain/nutrition';
import { isDateKey, todayKey, type DateKey } from './dates';

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function useParams() {
  const raw = useLocalSearchParams() as Params;
  return {
    string: (key: string): string | undefined => first(raw[key]) || undefined,
    date: (key = 'date'): DateKey => {
      const v = first(raw[key]);
      return isDateKey(v) ? v : todayKey();
    },
    category: (key = 'category'): MealCategory | undefined => {
      const v = first(raw[key]);
      return isMealCategory(v) ? v : undefined;
    },
  };
}
