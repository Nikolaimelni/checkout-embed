import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema.ts';

export type Database = SqliteRemoteDatabase<typeof schema>;

export type DatabaseHandle = {
  readonly db: Database;
  /** Applies one migration statement. The migrator needs this, nothing else does. */
  readonly exec: (sql: string) => void;
  readonly ping: () => boolean;
  readonly close: () => void;
};

/** node:sqlite behind drizzle's proxy driver: no native module to compile on Windows or CI. */
export function createDatabase(url: string): DatabaseHandle {
  if (url !== ':memory:') mkdirSync(dirname(url), { recursive: true });

  const sqlite = new DatabaseSync(url);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const db = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);

      if (method === 'run') {
        statement.run(...(params as never[]));
        return { rows: [] };
      }

      // The proxy wants positional rows and node:sqlite returns objects. Object.values would
      // lose a duplicated column name in a join; there are no joins.
      const toValues = (row: unknown): unknown[] => Object.values(row as object);

      if (method === 'get') {
        const row = statement.get(...(params as never[]));
        return { rows: row === undefined ? [] : toValues(row) };
      }

      return { rows: statement.all(...(params as never[])).map(toValues) };
    },
    { schema },
  );

  return {
    db,
    exec: (sql) => sqlite.exec(sql),
    ping: () => sqlite.prepare('SELECT 1 AS ok').get() !== undefined,
    close: () => sqlite.close(),
  };
}
