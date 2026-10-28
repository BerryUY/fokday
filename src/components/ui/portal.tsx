import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * A layer above the navigator for sheets and dialogs. Unlike the native Modal it lives in
 * the same window as the rest of the app, so toasts (rendered after it) always show on top,
 * and open/close animations are fully ours.
 */

type Entry = { key: string; node: ReactNode };
type PortalApi = { set: (key: string, node: ReactNode) => void; remove: (key: string) => void };

const PortalContext = createContext<PortalApi | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const api = useMemo<PortalApi>(
    () => ({
      set: (key, node) =>
        setEntries((prev) => {
          const i = prev.findIndex((e) => e.key === key);
          if (i < 0) return [...prev, { key, node }];
          const next = [...prev];
          next[i] = { key, node };
          return next;
        }),
      remove: (key) => setEntries((prev) => prev.filter((e) => e.key !== key)),
    }),
    [],
  );
  return (
    <PortalContext.Provider value={api}>
      {children}
      {entries.map((e) => (
        <View key={e.key} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {e.node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

/** Renders its children in the overlay layer, in the order portals were opened. */
export function Portal({ children }: { children: ReactNode }) {
  const api = useContext(PortalContext);
  const key = useId();
  useLayoutEffect(() => {
    api?.set(key, children);
  });
  useEffect(() => () => api?.remove(key), [api, key]);
  return null;
}
