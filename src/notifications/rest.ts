import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CHANNELS } from './channels';

export const REST_ID = 'rest-timer';

/** Rings when the rest is over even if the phone is in your pocket with the screen off. */
export async function scheduleRestEnd(seconds: number, next: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: '¡Se terminó el descanso!', body: next, data: { url: '/sesion/activa', largeIcon: 'foki_strong' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNELS.workout },
    });
  } catch {
    // Without permission the workout works just the same.
  }
}

export async function cancelRestEnd(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
}
