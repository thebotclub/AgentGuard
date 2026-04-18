/**
 * AgentGuard Database Factory
 *
 * Creates the appropriate database adapter based on environment variables.
 *
 * Selection logic:
 *   DB_TYPE=postgres + DATABASE_URL set → PostgreSQL adapter
 *   Otherwise                           → SQLite adapter
 *
 * The factory returns an IDatabase (async interface) plus, for SQLite,
 * access to the raw better-sqlite3 instance via the { raw } property
 * (needed by route files that still use the raw DB directly).
 */

import type { IDatabase } from './db-interface.js';
import { logger } from './lib/logger.js';

export interface DbWithRaw {
  db: IDatabase;
  /**
   * For SQLite: the raw better-sqlite3 Database instance.
   * For PostgreSQL: null (route files must use the IDatabase interface).
   */
  raw: import('better-sqlite3').Database | null;
}

/**
 * Create and initialise the database adapter.
 * Call once at startup; await the returned promise.
 */
export async function createDb(): Promise<DbWithRaw> {
  const dbType = process.env['DB_TYPE'];
  const databaseUrl = process.env['DATABASE_URL'];

  if (dbType === 'postgres' && databaseUrl) {
    logger.info('[db] Using PostgreSQL adapter');
    const { createPostgresAdapter } = await import('./db-postgres.js');
    const db = await createPostgresAdapter(databaseUrl);
    await db.initialize();
    return { db, raw: null };
  }

  // Default: SQLite
  if (dbType === 'postgres') {
    logger.warn('[db] ⚠️  DB_TYPE=postgres but DATABASE_URL is not set — falling back to SQLite');
  }

  const dbPath = process.env['AG_DB_PATH'] ?? undefined;
  const { createSqliteAdapter } = await import('./db-sqlite.js');
  const { adapter, raw } = createSqliteAdapter(dbPath);
  await adapter.initialize();
  return { db: adapter, raw };
}
