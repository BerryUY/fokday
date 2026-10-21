import { getProfile, type FeatureKey } from '@/data/settings';
import { useQuery } from './db';

/** Which optional trackers this person turned on. Empty while loading, so nothing flashes in. */
export function useFeatures() {
  const { data } = useQuery((db) => getProfile(db), []);
  const features = data?.features ?? [];
  return {
    features,
    waterGoalMl: data?.waterGoalMl ?? 2500,
    has: (key: FeatureKey) => features.includes(key),
  };
}
