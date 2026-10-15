import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// MySQL uses its own schema (generated from prisma/schema.prisma) and migrations.
const isMySQL = process.env.DATABASE_URL?.startsWith('mysql:');
// Only used by scripts/mysql/migrations.js; ignored for other databases.
const shadowDatabaseUrl =
  isMySQL && process.env.SHADOW_DATABASE_URL?.startsWith('mysql:')
    ? process.env.SHADOW_DATABASE_URL
    : undefined;

export default defineConfig({
  ...(isMySQL && {
    schema: 'db/mysql/schema.prisma',
    migrations: { path: 'db/mysql/migrations' },
  }),
  datasource: {
    url: env('DATABASE_URL'),
    ...(shadowDatabaseUrl && { shadowDatabaseUrl }),
  },
});
