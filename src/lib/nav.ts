import { router, type Href } from 'expo-router';

/** Back if there is somewhere to go back to, otherwise to a sensible screen (e.g. after a deep link). */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
