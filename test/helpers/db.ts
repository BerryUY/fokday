import { prepareDatabase } from '@/db/migrate';
import type { Db, SqlValue } from '@/db/types';

/* Node's built-in SQLite, loaded through getBuiltinModule so Jest's resolver doesn't need to know it. */
const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

const plain = <T>(row: unknown): T => (row ? ({ ...(row as object) } as T) : (row as T));

/** Same interface as the expo-sqlite database the app uses, backed by a real SQLite engine. */
export function createRawDb(): Db & { close(): void } {
  const raw = new DatabaseSync(':memory:');
  return {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, params: SqlValue[]) {
      const r = raw.prepare(source).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return raw.prepare(source).all(...params).map((r: unknown) => plain<T>(r));
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      return plain<T>(raw.prepare(source).get(...params)) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      raw.close();
    },
  };
}

export async function createTestDb() {
  const db = createRawDb();
  await prepareDatabase(db);
  return db;
}
