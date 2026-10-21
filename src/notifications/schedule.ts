import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getProfile, getSetting, setSetting } from '@/data/settings';
import type { Db } from '@/db/types';
import { parseReminders, planReminders, type PlannedNotification, type RemindersConfig } from './plan';

const CHANNEL_ID = 'recordatorios';
const SETTING_KEY = 'reminders.config';

// Show reminders even while the app is open.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function getReminders(db: Db): Promise<RemindersConfig> {
  return parseReminders(await getSetting(db, SETTING_KEY));
}

export async function saveReminders(db: Db, config: RemindersConfig): Promise<void> {
  await setSetting(db, SETTING_KEY, JSON.stringify(config));
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Recordatorios',
    // eslint-disable-next-line import/namespace -- re-exported enum the import plugin can't follow; tsc checks it
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks Android for permission (needs the channel to exist first on Android 13+). */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

function toTrigger(p: PlannedNotification): Notifications.NotificationTriggerInput {
  return p.trigger.type === 'weekly'
    ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: p.trigger.weekday, hour: p.trigger.hour, minute: p.trigger.minute, channelId: CHANNEL_ID }
    : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: p.trigger.hour, minute: p.trigger.minute, channelId: CHANNEL_ID };
}

let lastApplied = '';

/**
 * Replaces every scheduled reminder with what the settings call for. Nothing is scheduled
 * without permission; this never asks for it (the settings screen does, when a switch is turned on).
 */
export async function applyReminders(db: Db, opts: { force?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web') return;
  const [config, profile] = await Promise.all([getReminders(db), getProfile(db)]);
  const planned = planReminders(config, profile.features, profile.trainingDays);
  const signature = JSON.stringify(planned);
  if (!opts.force && signature === lastApplied) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  if (planned.length > 0 && (await Notifications.getPermissionsAsync()).status === 'granted') {
    await ensureChannel();
    for (const p of planned) {
      await Notifications.scheduleNotificationAsync({ identifier: p.id, content: { title: p.title, body: p.body }, trigger: toTrigger(p) });
    }
  }
  lastApplied = signature;
}
