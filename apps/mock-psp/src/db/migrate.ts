import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import type { DatabaseHandle } from './client.ts';

// from cwd: once bundled into dist/, import.meta.url is one directory off
export const DEFAULT_MIGRATIONS_DIR = 'drizzle';

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
