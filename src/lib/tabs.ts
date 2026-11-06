import { router, type Href } from 'expo-router';

type TabName = 'index' | 'comidas' | 'entrenar' | 'progreso';

let jump: ((name: TabName) => boolean) | null = null;

/** The tab bar registers how to switch tabs, the same call a tap on it makes. */
export function registerTabs(fn: ((name: TabName) => boolean) | null) {
  jump = fn;
}

/** Opens a tab from inside the tabs: goes through the tab bar so the page always moves with it. */
export function goToTab(name: TabName) {
  if (jump?.(name)) return;
  router.navigate((name === 'index' ? '/' : `/${name}`) as Href);
}
