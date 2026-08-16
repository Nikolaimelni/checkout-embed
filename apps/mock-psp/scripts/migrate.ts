import { createDatabase } from '../src/db/client.ts';
import { applyMigrations } from '../src/db/migrate.ts';
import { env } from '../src/env.ts';

const handle = createDatabase(env.DATABASE_URL);

try {
  await applyMigrations(handle);
  process.stdout.write(`migrations applied to ${env.DATABASE_URL}\n`);
} finally {
  handle.close();
}
