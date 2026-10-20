import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Db } from '@/db/types';
import { getDataVersion, notifyDataChanged, subscribeData } from './dataBus';
import { useToast } from './toast';

const DbContext = createContext<Db | null>(null);

export function DbProvider({ db, children }: { db: Db; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb fuera de DbProvider');
  return db;
}

export function useDataVersion() {
  return useSyncExternalStore(subscribeData, getDataVersion, getDataVersion);
}

export type QueryState<T> = { data: T | undefined; error: Error | null; loading: boolean; reload: () => void };

/**
 * Runs a read against SQLite and re-runs it whenever data changes anywhere in the
 * app, when the screen regains focus, or when `deps` change.
 */
export function useQuery<T>(fn: (db: Db) => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const db = useDb();
  const version = useDataVersion();
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  const [focusTick, setFocusTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setFocusTick((t) => t + 1);
    }, []),
  );

  const reload = useCallback(() => setFocusTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fnRef
      .current(db)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error: Error) => alive && setState((s) => ({ data: s.data, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, focusTick, ...deps]);

  return { ...state, reload };
}

/**
 * Wraps a write: runs it, refreshes every screen, and shows errors as a toast.
 * Returns the result, or undefined if it failed.
 */
export function useMutation() {
  const db = useDb();
  const toast = useToast();
  return useCallback(
    async <T,>(fn: (db: Db) => Promise<T>, opts: { success?: string; silent?: boolean } = {}): Promise<T | undefined> => {
      try {
        const result = await fn(db);
        notifyDataChanged();
        if (opts.success) toast.show(opts.success);
        return result;
      } catch (e) {
        if (!opts.silent) toast.show(e instanceof Error ? e.message : 'No se pudo guardar.', 'error');
        return undefined;
      }
    },
    [db, toast],
  );
}
