import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// MySQL uses its own schema (generated from prisma/schema.prisma) and migrations.
const isMySQL = process.env.DATABASE_URL?.startsWith('mysql:');

export default defineConfig({
  ...(isMySQL && {
    schema: 'db/mysql/schema.prisma',
    migrations: { path: 'db/mysql/migrations' },
  }),
  datasource: {
    url: env('DATABASE_URL'),
    ...(process.env.SHADOW_DATABASE_URL && { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }),
  },
});
