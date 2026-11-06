import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { addWater } from '@/data/habits';
import { todayKey } from '@/lib/dates';
import { useMutation } from '@/state/db';

const GLASS_ML = 250;

/**
 * Opens the right screen when a notification (or one of its buttons) is tapped: the streak goes to
 * Inicio, a meal straight to the camera, and "Sumar un vaso" adds the glass.
 */
export function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const run = useMutation();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    const id = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (handled.current === id) return;
    handled.current = id;

    const data = response.notification.request.content.data as { url?: string } | undefined;
    const action = response.actionIdentifier;
    if (action === 'water-add') {
      void run((db) => addWater(db, todayKey(), GLASS_ML), { success: '¡Un vaso más!' });
      return;
    }
    if (action === 'scan') return router.push({ pathname: '/comida/escanear', params: { date: todayKey() } });
    if (action === 'photo') return router.push({ pathname: '/comida/foto', params: { date: todayKey() } });
    if (data?.url && data.url !== '/') router.push(data.url as Href);
  }, [response, run]);

  return null;
}
