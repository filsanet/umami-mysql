/**
 * MySQL checks for scripts/check-db.js.
 */
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const MIN_VERSION = '8.0.0';

export function isMySQL(url = process.env.DATABASE_URL) {
  return url?.startsWith('mysql:');
}

export function createMySQLAdapter(url) {
  // The mariadb driver only accepts the mariadb:// scheme.
  return new PrismaMariaDb(url.replace(/^mysql:/, 'mariadb:'));
}

export async function checkMySQLVersion(prisma) {
  const [{ version }] = await prisma.$queryRawUnsafe('select version() as version');
  const [major] = String(version).split('.').map(Number);

  if (/mariadb/i.test(version)) {
    throw new Error(`MariaDB is not supported. Please use MySQL ${MIN_VERSION} or greater.`);
  }

  if (!(major >= 8)) {
    throw new Error(
      `Database version is not compatible. Please upgrade to MySQL ${MIN_VERSION} or greater.`,
    );
  }

  // Reports are grouped in the viewer's timezone, which needs the named time zone tables.
  const [{ tz }] = await prisma.$queryRawUnsafe(
    "select convert_tz('2000-01-01 00:00:00', '+00:00', 'America/New_York') as tz",
  );

  if (tz === null) {
    throw new Error(
      'MySQL time zone tables are not loaded. Run mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql. See https://dev.mysql.com/doc/refman/8.0/en/time-zone-support.html',
    );
  }
}
