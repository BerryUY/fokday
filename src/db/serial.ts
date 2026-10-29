import type { Db } from './types';

/**
 * expo-sqlite transactions are not exclusive: two started at once interleave on the same
 * connection, and one fails with "cannot commit - no transaction is active" (seen when saving a
 * set's kg, reps and tick quickly). This makes every transaction wait for the previous one.
 * Safe because no transaction in the app starts another one inside it.
 */
export function serializeTransactions<T extends Db>(db: T): T {
  const original = db.withTransactionAsync.bind(db);
  let queue: Promise<void> = Promise.resolve();
  db.withTransactionAsync = (task) => {
    const run = queue.then(() => original(task));
    queue = run.catch(() => {});
    return run;
  };
  return db;
}
