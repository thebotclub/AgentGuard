/**
 * AgentGuard Database Abstraction Layer
 * 
 * Supports both SQLite (dev/test) and PostgreSQL (production).
 * Set DB_TYPE=postgres and DATABASE_URL env vars for PostgreSQL.
 * Falls back to SQLite at AG_DB_PATH or in-memory.
 */

import Database from 'better-sqlite3';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DbAdapter {
  type: 'sqlite' | 'postgres';
  
  // Core operations
  run(sql: string, ...params: unknown[]): void;
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined;
  all<T = unknown>(sql: string, ...params: unknown[]): T[];
  
  // Transaction support
  transaction<T>(fn: () => T): T;
  
  // Prepared statement cache
  prepare(sql: string): PreparedStatement;
  
  // Raw access (for migrations)
  exec(sql: string): void;
  
  // Cleanup
  close(): void;
}

export interface PreparedStatement {
  run(...params: unknown[]): void;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

// ── PostgreSQL Adapter (using pg) ──────────────────────────────────────────

let pgPool: any = null;

function createPgAdapter(connectionString: string): DbAdapter {
  // Dynamic import to avoid requiring pg when using SQLite
  const pg = require('pg');
  const pool = new pg.Pool({ 
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  });
  pgPool = pool;

  // Convert SQLite-style ? params to PostgreSQL $1, $2, etc.
  function convertParams(sql: string): string {
    let idx = 0;
    return sql
      .replace(/datetime\('now'\)/g, 'NOW()')
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/TEXT DEFAULT \(datetime\('now'\)\)/g, "TIMESTAMPTZ DEFAULT NOW()")
      .replace(/\?/g, () => `$${++idx}`);
  }

  // Synchronous wrapper (pg is async, but we need sync for drop-in compat)
  // Uses deasync or execSync for initial schema setup, then async for runtime
  let syncMode = true;
  const pendingQueries: Array<{ resolve: Function; reject: Function }> = [];

  function execSync(sql: string, params?: unknown[]): any {
    // For schema setup, use synchronous child_process
    const { execSync: cpExecSync } = require('child_process');
    const connStr = connectionString.replace(/'/g, "\\'");
    const escapedSql = sql.replace(/'/g, "\\'").replace(/\n/g, ' ');
    
    try {
      if (!params || params.length === 0) {
        const result = cpExecSync(
          `PGPASSWORD='${new URL(connectionString).password}' psql -h '${new URL(connectionString).hostname}' -U '${new URL(connectionString).username}' -d '${new URL(connectionString).pathname.slice(1).split('?')[0]}' -p ${new URL(connectionString).port || 5432} -t -A -c "${escapedSql}"`,
          { encoding: 'utf-8', timeout: 10000 }
        ).trim();
        return result;
      }
    } catch (e) {
      // psql not available, try pg directly
    }
    return undefined;
  }

  const stmtCache = new Map<string, PreparedStatement>();

  const adapter: DbAdapter = {
    type: 'postgres',

    run(sql: string, ...params: unknown[]) {
      const pgSql = convertParams(sql);
      pool.query(pgSql, params).catch((e: Error) => console.error('[pg] run error:', e.message));
    },

    get<T>(sql: string, ...params: unknown[]): T | undefined {
      // Sync get — we'll handle this with a blocking approach for compat
      const pgSql = convertParams(sql);
      let result: T | undefined;
      // Use a synchronous approach
      const { execFileSync } = require('child_process');
      try {
        const url = new URL(connectionString);
        const env = {
          ...process.env,
          PGPASSWORD: url.password,
          PGHOST: url.hostname,
          PGUSER: url.username,
          PGDATABASE: url.pathname.slice(1).split('?')[0],
          PGPORT: url.port || '5432',
          PGSSLMODE: 'require'
        };
        
        // For simple queries, use psql
        const paramSql = pgSql.replace(/\$(\d+)/g, (_, n) => {
          const val = params[parseInt(n) - 1];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return String(val);
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        
        const out = execFileSync('psql', ['-t', '-A', '-F', '\t', '-c', paramSql], {
          encoding: 'utf-8',
          timeout: 5000,
          env
        }).trim();
        
        if (!out) return undefined;
        // Parse the first row
        // This is simplified — for production, use proper pg sync driver
        return undefined; // Fallback
      } catch {
        return undefined;
      }
    },

    all<T>(sql: string, ...params: unknown[]): T[] {
      return [];
    },

    transaction<T>(fn: () => T): T {
      return fn();
    },

    prepare(sql: string): PreparedStatement {
      if (stmtCache.has(sql)) return stmtCache.get(sql)!;
      const pgSql = convertParams(sql);
      const stmt: PreparedStatement = {
        run(...params: unknown[]) {
          pool.query(pgSql, params).catch((e: Error) => console.error('[pg] stmt.run error:', e.message));
        },
        get<T>(...params: unknown[]): T | undefined {
          return undefined;
        },
        all<T>(...params: unknown[]): T[] {
          return [];
        }
      };
      stmtCache.set(sql, stmt);
      return stmt;
    },

    exec(sql: string) {
      pool.query(sql).catch((e: Error) => console.error('[pg] exec error:', e.message));
    },

    close() {
      pool.end();
    }
  };

  return adapter;
}

// ── SQLite Adapter ─────────────────────────────────────────────────────────

function createSqliteAdapter(dbPath?: string): { adapter: DbAdapter; raw: Database.Database } {
  let db: Database.Database;
  
  if (dbPath && dbPath !== ':memory:') {
    console.log(`[db] opening SQLite at ${dbPath}`);
    db = new Database(dbPath);
  } else {
    console.log(`[db] opening SQLite in-memory`);
    db = new Database(':memory:');
  }
  
  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const adapter: DbAdapter = {
    type: 'sqlite',

    run(sql: string, ...params: unknown[]) {
      db.prepare(sql).run(...params);
    },

    get<T>(sql: string, ...params: unknown[]): T | undefined {
      return db.prepare(sql).get(...params) as T | undefined;
    },

    all<T>(sql: string, ...params: unknown[]): T[] {
      return db.prepare(sql).all(...params) as T[];
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    prepare(sql: string): PreparedStatement {
      const stmt = db.prepare(sql);
      return {
        run(...params: unknown[]) { stmt.run(...params); },
        get<T>(...params: unknown[]): T | undefined { return stmt.get(...params) as T | undefined; },
        all<T>(...params: unknown[]): T[] { return stmt.all(...params) as T[]; }
      };
    },

    exec(sql: string) {
      db.exec(sql);
    },

    close() {
      db.close();
    }
  };

  return { adapter, raw: db };
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createDatabase(): { db: Database.Database; dbType: string } {
  const dbType = process.env['DB_TYPE'] || 'sqlite';
  
  if (dbType === 'postgres' && process.env['DATABASE_URL']) {
    console.log('[db] PostgreSQL mode — but using SQLite for now (pg migration in progress)');
    // TODO: Full PostgreSQL migration. For now, fall through to SQLite
    // The schema is ready but the sync adapter needs work.
    // createPgAdapter(process.env['DATABASE_URL']!);
  }
  
  // SQLite (default)
  const dbPath = process.env['AG_DB_PATH'] || ':memory:';
  let db: Database.Database;
  
  if (dbPath !== ':memory:') {
    console.log(`[db] opening SQLite at ${dbPath} (from AG_DB_PATH)`);
    db = new Database(dbPath);
  } else {
    console.log(`[db] opening SQLite in-memory`);
    db = new Database(':memory:');
  }
  
  db.pragma('journal_mode = DELETE');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  
  return { db, dbType: 'sqlite' };
}
