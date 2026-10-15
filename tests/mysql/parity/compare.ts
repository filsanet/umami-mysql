import { isDeepStrictEqual } from 'node:util';

export type Results = Record<
  string,
  { volatile?: boolean; tiedAtLimit?: string; result?: unknown; error?: string }
>;

export interface Comparison {
  name: string;
  status: 'match' | 'order' | 'mismatch' | 'mysql-error' | 'both-error' | 'missing';
  detail?: string;
}

const sortKey = (v: unknown) => JSON.stringify(v);

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortDeep).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sortDeep(v)]));
  }
  return value;
}

/** First differing path between two values, for reporting. */
export function firstDifference(a: unknown, b: unknown, path = '$'): string | null {
  if (isDeepStrictEqual(a, b)) return null;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}.length: ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const diff = firstDifference((a as any)[key], (b as any)[key], `${path}.${key}`);
      if (diff) return diff;
    }
  }

  return `${path}: ${JSON.stringify(a)?.slice(0, 200)} != ${JSON.stringify(b)?.slice(0, 200)}`;
}

/** Drops the rows tied at the lowest value of `field`, where a LIMIT may cut. */
function dropTiedAtLimit(pg: unknown, my: unknown, field: string) {
  if (!Array.isArray(pg) || !Array.isArray(my)) return [pg, my];

  const values = [...pg, ...my].map(row => row?.[field]).filter(v => typeof v === 'number');
  const min = Math.min(...values);
  const keep = (rows: any[]) => rows.filter(row => row?.[field] !== min);

  return [keep(pg), keep(my)];
}

/**
 * Compares MySQL results against the PostgreSQL baseline. Rows that only differ in
 * order are reported separately: SQL leaves the order of tied rows undefined.
 */
export function compareResults(postgres: Results, mysql: Results): Comparison[] {
  return Object.keys(postgres).map(name => {
    const pg = postgres[name];
    const my = mysql[name];

    if (!my) return { name, status: 'missing' };
    if (pg.error && my.error) return { name, status: 'both-error', detail: pg.error };
    if (my.error) return { name, status: 'mysql-error', detail: my.error };
    if (pg.error) return { name, status: 'mismatch', detail: `PostgreSQL failed: ${pg.error}` };

    const [a, b] = pg.tiedAtLimit
      ? dropTiedAtLimit(pg.result, my.result, pg.tiedAtLimit)
      : [pg.result, my.result];

    if (isDeepStrictEqual(a, b)) return { name, status: 'match' };
    if (isDeepStrictEqual(sortDeep(a), sortDeep(b))) return { name, status: 'order' };

    return { name, status: 'mismatch', detail: firstDifference(a, b) ?? '' };
  });
}
