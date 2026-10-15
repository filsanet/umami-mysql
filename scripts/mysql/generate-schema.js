/* eslint-disable no-console */
/**
 * Generates db/mysql/schema.prisma from the upstream PostgreSQL schema
 * (prisma/schema.prisma) so MySQL tracks upstream model changes automatically.
 *
 *   node scripts/mysql/generate-schema.js          write the MySQL schema
 *   node scripts/mysql/generate-schema.js --check  exit 1 if it is out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(root, 'prisma/schema.prisma');
const target = resolve(root, 'db/mysql/schema.prisma');

const HEADER = `// GENERATED FILE - DO NOT EDIT.
// Source: prisma/schema.prisma. Regenerate with: pnpm mysql:schema
`;

// Postgres native types and their MySQL equivalents.
const TYPE_MAP = [
  [/@db\.Uuid\b/g, '@db.VarChar(36)'],
  [/@db\.Timestamptz\((\d)\)/g, '@db.DateTime($1)'],
  [/@db\.Timestamp\((\d)\)/g, '@db.DateTime($1)'],
  [/@db\.Integer\b/g, '@db.Int'],
  [/@db\.Text\b/g, '@db.Text'],
];

export function toMySQLSchema(schema) {
  let out = schema
    .replace(/(datasource db \{[^}]*provider\s*=\s*)"postgresql"/, '$1"mysql"')
    // db/mysql/ is one level deeper than prisma/
    .replace(/(output\s*=\s*")\.\.\//, '$1../../');

  for (const [pattern, replacement] of TYPE_MAP) {
    out = out.replace(pattern, replacement);
  }

  // Unannotated String columns are `text` in Postgres but varchar(191) in MySQL.
  // Widen the ones that are not keys so long values (secrets, settings) still fit.
  out = out.replace(/model (\w+) \{([\s\S]*?)\n\}/g, (_block, name, body) => {
    const keyed = new Set();

    for (const [, fields] of body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)) {
      for (const f of fields.split(',')) keyed.add(f.trim().split('(')[0]);
    }

    const lines = body.split('\n').map(line => {
      const match = line.match(/^(\s+)(\w+)(\s+)String(\??)(\s.*)?$/);

      if (!match) return line;

      const [, , field, , , rest = ''] = match;

      if (/@db\.|@id\b|@unique\b/.test(rest) || keyed.has(field)) return line;

      return `${line.replace(/\s+$/, '')} @db.Text`;
    });

    return `model ${name} {${lines.join('\n')}\n}`;
  });

  if (/@db\.(Uuid|Timestamptz|Integer|Inet|Citext|JsonB)/.test(out)) {
    throw new Error(
      'Unmapped PostgreSQL native type in schema. Update scripts/mysql/generate-schema.js.',
    );
  }

  return HEADER + out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const generated = toMySQLSchema(readFileSync(source, 'utf8'));

  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      // missing file is out of date
    }

    if (current !== generated) {
      console.error('db/mysql/schema.prisma is out of date. Run: pnpm mysql:schema');
      process.exit(1);
    }

    console.log('db/mysql/schema.prisma is up to date.');
  } else {
    writeFileSync(target, generated);
    console.log(`Wrote ${target}`);
  }
}
