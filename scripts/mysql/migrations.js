/* eslint-disable no-console */
/**
 * Keeps db/mysql/migrations in step with db/mysql/schema.prisma.
 *
 *   node scripts/mysql/migrations.js create <name>   write the next migration
 *   node scripts/mysql/migrations.js check           exit 1 if a migration is missing
 *
 * Both commands need a scratch MySQL database for Prisma to replay the migrations
 * into, given as SHADOW_DATABASE_URL (it is wiped on every run).
 *
 * Name new migrations after the upstream PostgreSQL migration they mirror, so each
 * MySQL migration can be traced to prisma/migrations/<same name>.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMySQLAdapter } from './check-db.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = resolve(root, 'db/mysql/migrations');

// Analytics tables are case- and accent-sensitive, like PostgreSQL text, so values
// such as '/About' and '/about' stay distinct. The remaining tables use a
// case-insensitive collation so name searches behave like PostgreSQL's
// `mode: 'insensitive'` (which Prisma does not support on MySQL).
export const CASE_SENSITIVE_TABLES = [
  'session',
  'session_link',
  'website_event',
  'event_data',
  'session_data',
  'revenue',
  'session_replay',
  'heatmap_event',
];

const CASE_SENSITIVE_COLLATION = 'utf8mb4_0900_as_cs';
const CASE_INSENSITIVE_COLLATION = 'utf8mb4_0900_as_ci';

export function applyCollations(sql) {
  return sql.replace(
    /(CREATE TABLE `(\w+)` \([\s\S]*?\) DEFAULT CHARACTER SET utf8mb4 COLLATE )(\w+);/g,
    (_match, prefix, table) =>
      `${prefix}${CASE_SENSITIVE_TABLES.includes(table) ? CASE_SENSITIVE_COLLATION : CASE_INSENSITIVE_COLLATION};`,
  );
}

// Prisma replays the migrations into the shadow database but does not create it.
async function ensureShadowDatabase() {
  const url = new URL(process.env.SHADOW_DATABASE_URL);
  const name = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/mysql'; // connect through the always-present system database

  const adapter = await createMySQLAdapter(url.toString()).connect();
  try {
    await adapter.executeRaw({
      sql: `create database if not exists \`${name.replace(/`/g, '``')}\``,
      args: [],
      argTypes: [],
    });
  } finally {
    await adapter.dispose();
  }
}

async function diff() {
  if (!process.env.SHADOW_DATABASE_URL) {
    throw new Error('SHADOW_DATABASE_URL must point to a scratch MySQL database.');
  }

  await ensureShadowDatabase();

  const output = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      migrationsDir,
      '--to-schema',
      resolve(root, 'db/mysql/schema.prisma'),
      '--script',
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: process.env.SHADOW_DATABASE_URL },
      encoding: 'utf8',
    },
  );

  return output.replace(/^Loaded Prisma config.*\n/m, '');
}

const isEmpty = sql => !sql.replace(/--.*$/gm, '').trim();

const [command, name] = process.argv.slice(2);

if (command === 'create') {
  if (!name) throw new Error('Usage: migrations.js create <name>');

  const sql = await diff();

  if (isEmpty(sql)) {
    console.log('MySQL schema and migrations are already in sync.');
    process.exit(0);
  }

  const dir = resolve(migrationsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'migration.sql'), applyCollations(sql));
  console.log(`Wrote ${dir}/migration.sql`);
} else if (command === 'check') {
  const sql = await diff();

  if (!isEmpty(sql)) {
    console.error('db/mysql/migrations is missing changes from db/mysql/schema.prisma:\n');
    console.error(sql);
    console.error('Run: SHADOW_DATABASE_URL=... node scripts/mysql/migrations.js create <name>');
    process.exit(1);
  }

  console.log(
    `MySQL migrations are in sync (${readdirSync(migrationsDir).length - 1} migrations).`,
  );
} else {
  console.error('Usage: migrations.js <create <name>|check>');
  process.exit(1);
}
