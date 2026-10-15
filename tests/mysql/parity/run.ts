/* eslint-disable no-console */
/**
 * Seeds the parity dataset into DATABASE_URL, runs every case and writes the
 * results as JSON. Run through scripts/mysql/parity.ts, which does this for
 * PostgreSQL and MySQL and compares the output.
 *
 *   tsx tests/mysql/parity/run.ts <output.json> [case-name-filter]
 */
import { writeFileSync } from 'node:fs';
import { createRandom } from './random';

// Make umami's uuid() (the uuid package calls Web Crypto's randomUUID) deterministic,
// so ids generated while seeding match across databases. Other callers, such as
// Prisma internals that differ per database, keep real random ids.
const ids = createRandom(0x1d5);
const randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  value: () => (/[\\/]uuid[\\/]/.test(new Error().stack ?? '') ? ids.uuid() : randomUUID()),
});

const [output, filter] = process.argv.slice(2);

async function main() {
  const { ingest } = await import('./ingest');
  const { getCases } = await import('./cases');
  const { normalize } = await import('./normalize');

  const started = Date.now();
  const stats = await ingest(new Date());
  console.log(
    `Seeded ${stats.sessions} sessions, ${stats.events} events (${Date.now() - started}ms)`,
  );

  const results: Record<
    string,
    { volatile?: boolean; tiedAtLimit?: string; result?: unknown; error?: string }
  > = {};
  const cases = (await getCases()).filter(c => !filter || c.name.includes(filter));

  for (const { name, run, volatile, tiedAtLimit } of cases) {
    try {
      results[name] = { volatile, tiedAtLimit, result: normalize(await run(), volatile) };
    } catch (e) {
      results[name] = {
        volatile,
        tiedAtLimit,
        error: String((e as Error)?.message ?? e)
          .split('\n')
          .slice(-3)
          .join(' '),
      };
    }
  }

  writeFileSync(output, JSON.stringify(results, null, 1));
  console.log(`Ran ${cases.length} cases -> ${output}`);
}

main().then(
  () => process.exit(0),
  e => {
    console.error(e);
    process.exit(1);
  },
);
