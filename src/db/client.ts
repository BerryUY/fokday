import * as SQLite from 'expo-sqlite';
import { prepareDatabase } from './migrate';
import { serializeTransactions } from './serial';
import type { Db } from './types';

export const DATABASE_NAME = 'momentum.db';

let instance: Promise<Db> | null = null;

/** Opens the on-device database once, migrates it and seeds the catalog. */
export function openAppDatabase(): Promise<Db> {
  instance ??= (async () => {
    const db = serializeTransactions((await SQLite.openDatabaseAsync(DATABASE_NAME)) as unknown as Db);
    await prepareDatabase(db);
    return db;
  })().catch((e) => {
    instance = null;
    throw e;
  });
  return instance;
}
