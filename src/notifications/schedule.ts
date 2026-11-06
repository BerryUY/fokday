import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getMeta, setMeta } from '@/backup/snapshot';
import { isOnboarded } from '@/data/settings';
import type { Db } from '@/db/types';
import type { FokiMood } from '@/domain/mood';
import { CHANNELS, type ChannelKey } from './channels';
import type { PlannedNotification } from './plan';
import { REST_ID } from './rest';
import { currentPlan } from './state';

const BRAND = '#C8F560';
const FLAME = '#FF9632';
const SOUND = 'reward.wav';

// Show reminders even while the app is open, except the rest timer: there the screen already rings.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const show = n.request.identifier !== REST_ID;
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

/** The image shown next to the text: Foki's face (a drawable added by plugins/withNotificationArt). */
export const artFor = (mood: FokiMood) => `foki_${mood}`;

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  // eslint-disable-next-line import/namespace -- re-exported enum the import plugin can't follow; tsc checks it
  const importance = Notifications.AndroidImportance.HIGH;
  const channels: Record<ChannelKey, Notifications.NotificationChannelInput> = {
    streak: { name: 'Tu racha', description: 'Te avisa antes de que se corte tu racha', importance, sound: SOUND, vibrationPattern: [0, 120, 80, 120, 80, 260], lightColor: FLAME },
    meals: { name: 'Comidas', description: 'Te recuerda registrar lo que comés', importance, sound: SOUND, lightColor: BRAND },
    water: { name: 'Agua', description: 'Te recuerda tomar agua', importance, sound: SOUND, lightColor: BRAND },
    workout: { name: 'Entrenamiento', description: 'Los días de gym y el fin del descanso', importance, sound: SOUND, vibrationPattern: [0, 180, 120, 180], lightColor: BRAND },
    other: { name: 'Otros avisos', description: 'Creatina, tareas y peso', importance, sound: SOUND, lightColor: BRAND },
  };
  for (const [key, channel] of Object.entries(channels)) await Notifications.setNotificationChannelAsync(CHANNELS[key as ChannelKey], channel);
  // The channels from before Foki.
  await Notifications.deleteNotificationChannelAsync('recordatorios').catch(() => {});
  await Notifications.deleteNotificationChannelAsync('racha').catch(() => {});

  // The buttons under the notification.
  await Notifications.setNotificationCategoryAsync('meal', [
    { identifier: 'photo', buttonTitle: 'Sacar foto', options: { opensAppToForeground: true } },
    { identifier: 'scan', buttonTitle: 'Escanear', options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('water', [{ identifier: 'water-add', buttonTitle: 'Sumar un vaso', options: { opensAppToForeground: true } }]);
}

/**
 * Asks for permission once, right after the welcome screen (Android 13+ needs the channel
 * to exist first). Never nags again: if the person says no, the app simply doesn't remind.
 */
async function ensurePermission(db: Db): Promise<boolean> {
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if ((await getMeta(db, 'notifications_asked')) === '1' || !current.canAskAgain) return false;
  await setMeta(db, 'notifications_asked', '1');
  return (await Notifications.requestPermissionsAsync()).status === 'granted';
}

const content = (p: PlannedNotification): Notifications.NotificationContentInput => ({
  title: p.title,
  body: p.body,
  color: p.channel === 'streak' ? FLAME : BRAND,
  data: { url: p.url, largeIcon: artFor(p.mood) },
  ...(p.category ? { categoryIdentifier: p.category } : {}),
});

const stamp = (p: PlannedNotification) => `${p.at.getTime()}|${p.title}|${p.body}`;

// What's scheduled right now, by id, so a change only touches what changed.
let applied: Map<string, string> | null = null;

/** Brings what's scheduled in line with the current plan. Skipped for whatever didn't change. */
export async function applyReminders(db: Db, opts: { force?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web' || !(await isOnboarded(db))) return;
  if (!(await ensurePermission(db))) return;
  const planned = await currentPlan(db);

  if (!applied || opts.force) {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(existing.filter((n) => n.identifier !== REST_ID).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    applied = new Map();
  }

  const wanted = new Set(planned.map((p) => p.id));
  for (const id of applied.keys()) {
    if (!wanted.has(id)) {
      await Notifications.cancelScheduledNotificationAsync(id);
      applied.delete(id);
    }
  }
  for (const p of planned) {
    if (applied.get(p.id) === stamp(p)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: content(p),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNELS[p.channel] },
    });
    applied.set(p.id, stamp(p));
  }
}
