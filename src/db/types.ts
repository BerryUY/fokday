export type SqlValue = string | number | null;

/**
 * The subset of expo-sqlite's SQLiteDatabase the app uses. Keeping the data layer
 * on this interface lets tests run the exact same SQL against Node's SQLite.
 */
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
