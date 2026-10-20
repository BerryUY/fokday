import { MIGRATIONS, SCHEMA_VERSION, type Migration } from './schema';
import { seedDatabase } from './seed';
import type { Db } from './types';

export async function getSchemaVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  return row?.user_version ?? 0;
}

/**
 * Brings the database to the latest schema. Each migration runs in its own
 * transaction, so a failure leaves the previous version intact.
 * Refuses to open a database created by a newer app version.
 */
export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<{ from: number; to: number }> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const from = await getSchemaVersion(db);
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (from > latest) {
    throw new Error(
      `La base de datos es de una versión más nueva de la app (esquema ${from}, esta versión soporta ${latest}). Instalá la última versión.`,
    );
  }
  for (const m of migrations) {
    if (m.version <= from) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA user_version = ${m.version}`);
    });
  }
  return { from, to: Math.max(from, latest) };
}

/** Open-time setup shared by the app and the tests. */
export async function prepareDatabase(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
  await seedDatabase(db);
}

export { SCHEMA_VERSION };
