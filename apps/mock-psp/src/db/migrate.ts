import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import type { DatabaseHandle } from './client.ts';

/**
 * Relative to the working directory rather than to this file. The bundled server lives in
 * dist/ while the migrations stay next to it, so a path computed from import.meta.url is
 * right in development and one directory off in production.
 */
export const DEFAULT_MIGRATIONS_DIR = 'drizzle';

/**
 * The generated SQL is checked in and read by a human before it runs. drizzle-kit writes
 * it, this applies it, and nothing here ever touches a schema it did not see in a file.
 */
export async function applyMigrations(
  handle: DatabaseHandle,
  migrationsFolder: string = resolve(process.cwd(), DEFAULT_MIGRATIONS_DIR),
): Promise<void> {
  await migrate(
    handle.db,
    async (queries) => {
      for (const query of queries) handle.exec(query);
    },
    { migrationsFolder },
  );
}
