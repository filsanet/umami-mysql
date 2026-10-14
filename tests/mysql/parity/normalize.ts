/**
 * Normalizes query results so equivalent values from PostgreSQL and MySQL
 * compare equal: Decimal/BigInt/numeric strings become rounded numbers and
 * dates become ISO strings. Differences that remain are real.
 */

const NUMERIC = /^-?\d+(\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/;

function round(n: number) {
  // floats (MySQL double) vs numeric (PostgreSQL) differ in the last digits
  return Number.isInteger(n) ? n : Number(n.toPrecision(10));
}

export function normalize(value: unknown, volatile = false): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') return Number(value);

  // epoch-millisecond timestamps in realtime results
  if (typeof value === 'number') return volatile && value > 1e12 ? '<timestamp>' : round(value);

  if (typeof value === 'string') {
    if (NUMERIC.test(value)) return round(Number(value));

    if (ISO_DATE.test(value)) {
      const date = new Date(/[Z+-]\d*:?\d*$/.test(value.slice(10)) ? value : `${value}Z`);
      if (!Number.isNaN(date.getTime())) return volatile ? '<date>' : date.toISOString();
    }

    return value;
  }

  if (value instanceof Date) return volatile ? '<date>' : value.toISOString();

  if (Array.isArray(value)) return value.map(v => normalize(v, volatile));

  if (typeof value === 'object') {
    // Prisma Decimal
    if (
      typeof (value as any).toFixed === 'function' &&
      typeof (value as any).toNumber === 'function'
    ) {
      return round((value as any).toNumber());
    }

    return Object.fromEntries(
      Object.entries(value as object)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v, volatile)]),
    );
  }

  return value;
}
