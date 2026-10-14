import type { PrismaMariaDb } from '@prisma/adapter-mariadb';
import debug from 'debug';
import { bindMySQLParams, getBooleanAliases, MYSQL_SESSION_SQL, toMySQL } from './dialect';

const log = debug('umami:mysql');

type PoolConfig = Exclude<
  ConstructorParameters<typeof PrismaMariaDb>[0],
  string | { getConnection: unknown }
>;

/**
 * Builds a mariadb driver pool config from a mysql:// DATABASE_URL.
 *
 * Supported query parameters: connection_limit, pool_timeout (seconds),
 * connect_timeout (seconds), ssl (true) and sslaccept (accept_invalid_certs), which
 * mirror Prisma's MySQL URL options.
 */
export function getMySQLPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const params = url.searchParams;
  const number = (name: string) => (params.has(name) ? Number(params.get(name)) : undefined);
  const seconds = (name: string) =>
    params.has(name) ? Number(params.get(name)) * 1000 : undefined;

  const ssl =
    params.get('ssl') === 'true' || params.has('sslaccept')
      ? { rejectUnauthorized: params.get('sslaccept') !== 'accept_invalid_certs' }
      : undefined;

  return {
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: number('connection_limit'),
    acquireTimeout: seconds('pool_timeout'),
    connectTimeout: seconds('connect_timeout'),
    ...(ssl && { ssl }),
    initSql: MYSQL_SESSION_SQL,
  };
}

interface DecimalLike {
  isInteger: () => boolean;
  toNumber: () => number;
}

const isDecimal = (value: unknown): value is DecimalLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as DecimalLike).isInteger === 'function' &&
  typeof (value as DecimalLike).toNumber === 'function';

/**
 * MySQL returns SUM() over integers as DECIMAL, where PostgreSQL returns bigint.
 * Whole DECIMAL values are returned as numbers so API responses keep their shape,
 * and 0/1 predicate columns as booleans.
 */
function normalizeRow(row: unknown, booleans: Set<string>) {
  if (!row || typeof row !== 'object') return row;

  for (const [key, value] of Object.entries(row)) {
    if (booleans.has(key) && (value === 0 || value === 1 || typeof value === 'bigint')) {
      row[key] = Number(value) === 1;
    } else if (isDecimal(value) && value.isInteger() && Number.isSafeInteger(value.toNumber())) {
      row[key] = value.toNumber();
    }
  }

  return row;
}

const RAW_OPERATIONS = ['$queryRawUnsafe', '$executeRawUnsafe'];

interface ExtendableClient {
  $extends: (extension: any) => unknown;
}

/**
 * Translates every PostgreSQL raw query sent through the client into MySQL, so
 * upstream code calling $queryRawUnsafe / $executeRawUnsafe works unchanged.
 * Returns the client untouched for other databases.
 */
export function withMySQLDialect<T extends ExtendableClient>(client: T): T {
  if (!process.env.DATABASE_URL?.startsWith('mysql:')) {
    return client;
  }

  return client.$extends({
    name: 'mysql-dialect',
    query: {
      async $allOperations({ operation, args, query }) {
        if (!RAW_OPERATIONS.includes(operation)) {
          return query(args);
        }

        const [sql, ...values] = args as [string, ...unknown[]];
        const translated = toMySQL(sql);
        const { query: mysqlSql, params } = bindMySQLParams(translated, values);

        if (process.env.LOG_QUERY) {
          log('MYSQL QUERY:\n', mysqlSql);
        }

        const result = await query([mysqlSql, ...params]);

        if (!Array.isArray(result)) return result;

        const booleans = getBooleanAliases(sql);

        return result.map(row => normalizeRow(row, booleans));
      },
    },
  }) as T;
}
