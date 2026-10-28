import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getMeta, setMeta } from '@/backup/snapshot';
import { getAttendance } from '@/data/attendance';
import { getHabits } from '@/data/habits';
import { getLogsForDate } from '@/data/meals';
import { getProfile, isOnboarded } from '@/data/settings';
import { listTodos } from '@/data/todos';
import { listWeights } from '@/data/weight';
import type { Db } from '@/db/types';
import { latestEntry } from '@/domain/weight';
import { todayKey } from '@/lib/dates';
import { planReminders, type PlannedNotification } from './plan';

const CHANNEL_ID = 'recordatorios';

// Show reminders even while the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recordatorios',
    // eslint-disable-next-line import/namespace -- re-exported enum the import plugin can't follow; tsc checks it
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/**
 * Asks for permission once, right after the welcome screen (Android 13+ needs the channel
 * to exist first). Never nags again: if the person says no, the app simply doesn't remind.
 */
async function ensurePermission(db: Db): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if ((await getMeta(db, 'notifications_asked')) === '1' || !current.canAskAgain) return false;
  await setMeta(db, 'notifications_asked', '1');
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

async function currentPlan(db: Db): Promise<PlannedNotification[]> {
  const today = todayKey();
  const [profile, attendance, logs, habits, todos, weights] = await Promise.all([
    getProfile(db),
    getAttendance(db, today),
    getLogsForDate(db, today),
    getHabits(db, today),
    listTodos(db, today),
    listWeights(db),
  ]);
  return planReminders({
    now: new Date(),
    features: profile.features,
    trainingDays: profile.trainingDays,
    attendedToday: !!attendance,
    mealsLoggedToday: logs.length,
    waterMlToday: habits.waterMl,
    waterGoalMl: profile.waterGoalMl,
    creatineToday: habits.creatine,
    pendingTodosToday: todos.filter((t) => !t.done).length,
    lastWeightDate: latestEntry(weights)?.date ?? null,
  });
}

let lastApplied = '';

/** Replaces every scheduled reminder with the current plan. Skipped when nothing changed. */
export async function applyReminders(db: Db, opts: { force?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web' || !(await isOnboarded(db))) return;
  if (!(await ensurePermission(db))) return;
  const planned = await currentPlan(db);
  const signature = JSON.stringify(planned.map((p) => [p.id, p.at.getTime()]));
  if (!opts.force && signature === lastApplied) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_ID },
    });
  }
  lastApplied = signature;
}
