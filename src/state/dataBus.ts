/**
 * Minimal change notifier: every successful write bumps a version, and screens
 * re-read SQLite when it changes. SQLite stays the single source of truth.
 */
type Listener = () => void;

let version = 0;
const listeners = new Set<Listener>();

export function notifyDataChanged() {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeData(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataVersion() {
  return version;
}
