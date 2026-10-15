/**
 * Fails when raw SQL can reach MySQL without the parity suite exercising it.
 *
 * - Every exported function in a src/queries/sql file that runs raw SQL must be
 *   called by a parity case (tests/mysql/parity/cases.ts or ingest.ts), or be
 *   listed in tests/mysql/parity/uncovered.json with a reason.
 * - Raw SQL anywhere else in src must be in a file listed in KNOWN_RAW_FILES,
 *   so new call sites outside the query folder get reviewed for MySQL.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const RAW_SQL =
  /\brawQuery\(|executeRawQuery|\$queryRawUnsafe|\$executeRawUnsafe|\$queryRaw`|\$executeRaw`/;

// Files outside src/queries/sql that build raw SQL, reviewed for MySQL.
const KNOWN_RAW_FILES = [
  'src/lib/prisma.ts', // the raw query helpers themselves
  'src/lib/mysql/client.ts', // the MySQL translation layer
  'src/lib/clickhouse.ts', // ClickHouse only
  'src/queries/prisma/website.ts', // Postgres-only search_path, skipped on MySQL
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// Exported query entry points: functions that dispatch through runQuery with a
// relational implementation (ClickHouse-only queries never reach MySQL).
function queryFunctions(source: string) {
  return source
    .split(/^(?=export )/m)
    .map(chunk => ({ name: chunk.match(/^export (?:async )?function (\w+)/)?.[1], chunk }))
    .filter(
      ({ name, chunk }) =>
        name && chunk.includes('runQuery(') && !/\[PRISMA\]:\s*notImplemented/.test(chunk),
    )
    .map(({ name }) => name);
}

const parityDir = join(ROOT, 'tests/mysql/parity');
const caseSource = ['cases.ts', 'ingest.ts']
  .map(file => readFileSync(join(parityDir, file), 'utf8'))
  .join('\n');
const uncovered: Record<string, string> = JSON.parse(
  readFileSync(join(parityDir, 'uncovered.json'), 'utf8'),
);

const problems: string[] = [];
const seenUncovered = new Set<string>();

for (const file of walk(join(ROOT, 'src'))) {
  const path = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');

  if (!RAW_SQL.test(source)) continue;

  if (!path.startsWith('src/queries/sql/')) {
    if (!KNOWN_RAW_FILES.includes(path)) {
      problems.push(
        `${path}: runs raw SQL outside src/queries/sql. Check it works on MySQL, then add it to KNOWN_RAW_FILES in scripts/mysql/check-coverage.ts.`,
      );
    }
    continue;
  }

  for (const name of queryFunctions(source)) {
    if (new RegExp(`\\b${name}\\b`).test(caseSource)) continue;
    if (uncovered[name]) {
      seenUncovered.add(name);
      continue;
    }
    problems.push(
      `${path}: ${name}() runs raw SQL but no parity case calls it. Add a case to tests/mysql/parity/cases.ts.`,
    );
  }
}

for (const name of Object.keys(uncovered)) {
  if (!seenUncovered.has(name)) {
    problems.push(`tests/mysql/parity/uncovered.json: ${name} is covered or gone; remove it.`);
  }
}

if (problems.length) {
  console.error(`MySQL coverage check failed:\n\n${problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}

console.log('Every raw SQL query is covered by the MySQL parity suite.');
