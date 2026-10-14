/* eslint-disable no-console */
/**
 * PostgreSQL/MySQL parity suite.
 *
 * Seeds the same deterministic dataset into a fresh PostgreSQL and a fresh MySQL
 * database, runs every relational query against both and fails if MySQL returns
 * anything different. PostgreSQL is the reference: upstream umami is built and
 * tested on it.
 *
 *   PARITY_POSTGRES_URL=postgresql://... PARITY_MYSQL_URL=mysql://... pnpm test:mysql:parity
 *
 * The URLs name a server and a user allowed to create databases. Each run creates
 * its own scratch database on both servers (umami_parity_<id>) and drops it
 * afterwards; no existing database is touched. Options:
 *   --filter <text>   only run cases whose name contains <text>
 *   --keep-results    keep the raw result files in tests/mysql/parity/.results
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { compareResults, type Results } from '../../tests/mysql/parity/compare';
import { createMySQLAdapter } from './check-db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_DIR = path.join(ROOT, 'tests/mysql/parity/.results');

const args = process.argv.slice(2);
const filter = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : undefined;
const keep = args.includes('--keep-results');

const servers = {
  postgresql: process.env.PARITY_POSTGRES_URL,
  mysql: process.env.PARITY_MYSQL_URL,
};

for (const [name, url] of Object.entries(servers)) {
  if (!url) {
    console.error(`Set PARITY_${name === 'mysql' ? 'MYSQL' : 'POSTGRES'}_URL to a ${name} server.`);
    process.exit(1);
  }
}

const scratchName = `umami_parity_${Date.now().toString(36)}_${process.pid}`;

/** Runs one statement on the server through the Prisma driver adapters. */
async function execute(type: string, serverUrl: string, sql: string) {
  const factory =
    type === 'mysql'
      ? createMySQLAdapter(serverUrl)
      : new PrismaPg({ connectionString: serverUrl });
  const adapter = await factory.connect();

  try {
    await adapter.executeRaw({ sql, args: [], argTypes: [] } as any);
  } finally {
    await adapter.dispose();
  }
}

function scratchUrl(serverUrl: string) {
  const url = new URL(serverUrl);
  url.pathname = `/${scratchName}`;
  return url.toString();
}

function run(command: string, commandArgs: string[], databaseUrl: string) {
  execFileSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl, SKIP_DB_CHECK: '1' },
  });
}

mkdirSync(RESULTS_DIR, { recursive: true });

const results: Record<string, Results> = {};
const created: [string, string][] = [];

try {
  for (const [name, serverUrl] of Object.entries(servers)) {
    console.log(`\n=== ${name}: ${scratchName} ===`);
    await execute(name, serverUrl, `create database ${scratchName}`);
    created.push([name, serverUrl]);

    const url = scratchUrl(serverUrl);
    run('npx', ['prisma', 'generate'], url);
    run('npx', ['prisma', 'migrate', 'deploy'], url);

    const output = path.join(RESULTS_DIR, `${name}.json`);
    run('npx', ['tsx', 'tests/mysql/parity/run.ts', output, ...(filter ? [filter] : [])], url);
    results[name] = JSON.parse(readFileSync(output, 'utf8'));
  }
} finally {
  for (const [name, serverUrl] of created) {
    await execute(name, serverUrl, `drop database if exists ${scratchName}`).catch(e =>
      console.error(`Could not drop ${scratchName} on ${name}: ${e.message}`),
    );
  }

  // Leave the client generated for the developer's own database.
  if (process.env.DATABASE_URL) {
    run('npx', ['prisma', 'generate'], process.env.DATABASE_URL);
  }
}

const comparisons = compareResults(results.postgresql, results.mysql);
const count = (status: string) => comparisons.filter(c => c.status === status).length;
const failures = comparisons.filter(c => ['mismatch', 'mysql-error', 'missing'].includes(c.status));

console.log('\n=== Parity report ===');
for (const c of comparisons.filter(c => c.status !== 'match')) {
  console.log(`${c.status.padEnd(11)} ${c.name}${c.detail ? `\n            ${c.detail}` : ''}`);
}
console.log(
  `\n${count('match')} match, ${count('order')} differ only in row order, ` +
    `${count('both-error')} fail on both, ${failures.length} failing (of ${comparisons.length}).`,
);

// On GitHub Actions, list the failing queries on the run page.
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## PostgreSQL/MySQL parity',
    '',
    `${count('match')} match, ${count('order')} differ only in row order, ${count('both-error')} fail on both, **${failures.length} failing** (of ${comparisons.length}).`,
  ];

  if (failures.length) {
    lines.push('', '| Query | Status | Detail |', '| --- | --- | --- |');
    for (const c of failures) {
      const detail = (c.detail ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 300);
      lines.push(`| \`${c.name}\` | ${c.status} | ${detail} |`);
    }
  }

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (!keep) rmSync(RESULTS_DIR, { recursive: true, force: true });

process.exit(failures.length ? 1 : 0);
