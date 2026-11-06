import { router, type Href } from 'expo-router';

/** Back if there is somewhere to go back to, otherwise to a sensible screen (e.g. after a deep link). */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

let openedAt = 0;

/** Opens the running workout. A double tap would otherwise stack the same screen twice. */
export function openWorkout() {
  const now = Date.now();
  if (now - openedAt < 1000) return;
  openedAt = now;
  router.push('/sesion/activa');
}
