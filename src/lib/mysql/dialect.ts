/**
 * Translates the PostgreSQL dialect used by umami's raw relational queries into
 * MySQL 8 SQL.
 *
 * Upstream umami writes its raw queries for PostgreSQL only. Rather than fork every
 * query file, MySQL support rewrites the SQL text at execution time. Each rule below
 * handles one PostgreSQL construct. Queries that use constructs with no mechanical
 * MySQL equivalent get a hand-written MySQL implementation instead (see
 * src/queries/mysql).
 *
 * The connection runs with sql_mode ANSI_QUOTES, PIPES_AS_CONCAT and
 * NO_BACKSLASH_ESCAPES (see MYSQL_SESSION_SQL), so double-quoted identifiers,
 * `||` concatenation and standard string literals need no rewriting.
 */

export const MYSQL_SESSION_SQL = [
  // Case- and accent-sensitive like PostgreSQL, for literals and derived values.
  'SET NAMES utf8mb4 COLLATE utf8mb4_0900_as_cs',
  "SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',ANSI_QUOTES,PIPES_AS_CONCAT,NO_BACKSLASH_ESCAPES')",
  "SET SESSION time_zone = '+00:00'",
  'SET SESSION group_concat_max_len = 4294967295',
];

// Case-insensitive (but accent-sensitive) collation used to emulate ILIKE.
export const CI_COLLATION = 'utf8mb4_0900_as_ci';

const CAST_TYPES: Record<string, string | null> = {
  uuid: null,
  text: 'char',
  varchar: 'char',
  int: 'signed',
  int4: 'signed',
  int8: 'signed',
  integer: 'signed',
  bigint: 'signed',
  smallint: 'signed',
  numeric: 'decimal(65,10)',
  decimal: 'decimal(65,10)',
  float: 'double',
  float8: 'double',
  real: 'double',
  double: 'double',
  date: 'date',
  timestamp: 'datetime(6)',
  timestamptz: 'datetime(6)',
  json: 'json',
  jsonb: 'json',
  boolean: 'unsigned',
  bool: 'unsigned',
};

const IDENTIFIER_CHAR = /[\w.$"`]/;

function mapCastType(type: string) {
  const key = type.toLowerCase().replace(/\[\]$/, '');

  if (!(key in CAST_TYPES)) {
    throw new Error(`MySQL dialect: unsupported cast type "${type}".`);
  }

  return CAST_TYPES[key];
}

function skipString(sql: string, i: number, step: 1 | -1) {
  // i points at a quote; returns the index of the matching quote.
  const quote = sql[i];
  let j = i + step;

  while (j >= 0 && j < sql.length) {
    if (sql[j] === quote) {
      // '' is an escaped quote inside a literal
      if (sql[j + step] === quote) {
        j += step * 2;
        continue;
      }
      return j;
    }
    j += step;
  }

  return j;
}

/** Index of the parenthesis matching the one at `open` (searching forward). */
export function matchForward(sql: string, open: number) {
  let depth = 0;

  for (let i = open; i < sql.length; i++) {
    const c = sql[i];

    if (c === "'") {
      i = skipString(sql, i, 1);
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }

  throw new Error('MySQL dialect: unbalanced parentheses.');
}

/** Index of the parenthesis matching the one at `close` (searching backward). */
function matchBackward(sql: string, close: number) {
  let depth = 0;

  for (let i = close; i >= 0; i--) {
    const c = sql[i];

    if (c === "'") {
      i = skipString(sql, i, -1);
    } else if (c === ')') {
      depth++;
    } else if (c === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }

  throw new Error('MySQL dialect: unbalanced parentheses.');
}

/** Start index of the operand that ends just before `end` (exclusive). */
function operandStart(sql: string, end: number) {
  let i = end - 1;

  while (i >= 0 && /\s/.test(sql[i])) i--;

  if (sql[i] === '}' && sql[i - 1] === '}') {
    return sql.lastIndexOf('{{', i);
  }

  if (sql[i] === "'") {
    return skipString(sql, i, -1);
  }

  if (sql[i] === ')') {
    i = matchBackward(sql, i) - 1;
  }

  while (i >= 0 && IDENTIFIER_CHAR.test(sql[i])) i--;

  return i + 1;
}

/** End index (exclusive) of the operand that starts at or after `start`. */
function operandEnd(sql: string, start: number) {
  let i = start;

  while (i < sql.length && /\s/.test(sql[i])) i++;

  if (sql.startsWith('{{', i)) {
    return sql.indexOf('}}', i) + 2;
  }

  if (sql[i] === "'") {
    return skipString(sql, i, 1) + 1;
  }

  while (i < sql.length && IDENTIFIER_CHAR.test(sql[i])) i++;

  if (sql[i] === '(') {
    i = matchForward(sql, i) + 1;
  }

  return i;
}

/** Splits `s` on `sep` at parenthesis depth 0, outside string literals. */
export function splitTopLevel(s: string, sep: string) {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (c === "'") {
      i = skipString(s, i, 1);
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
    } else if (depth === 0 && s.startsWith(sep, i)) {
      parts.push(s.slice(last, i));
      last = i + sep.length;
      i += sep.length - 1;
    }
  }

  parts.push(s.slice(last));

  return parts;
}

function isInLiteral(sql: string, index: number) {
  for (let i = 0; i < index; i++) {
    if (sql[i] === "'") {
      i = skipString(sql, i, 1);
      if (i >= index) return true;
    }
  }

  return false;
}

/**
 * Repeatedly finds `pattern` (which must not be global) and replaces the match via
 * `replace`, which receives the match and returns [start, end, replacement].
 */
function rewrite(
  sql: string,
  pattern: RegExp,
  replace: (sql: string, match: RegExpExecArray) => [number, number, string] | null,
) {
  let from = 0;

  for (;;) {
    const re = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    re.lastIndex = from;
    const match = re.exec(sql);

    if (!match) return sql;

    const result = isInLiteral(sql, match.index) ? null : replace(sql, match);

    if (!result) {
      from = match.index + 1;
      continue;
    }

    const [start, end, replacement] = result;
    sql = sql.slice(0, start) + replacement + sql.slice(end);
    from = start;
  }
}

/** Removes `--` line comments, leaving string literals intact. */
function stripComments(sql: string) {
  let out = '';

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") {
      const end = skipString(sql, i, 1);
      out += sql.slice(i, end + 1);
      i = end;
    } else if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
    } else {
      out += sql[i];
    }
  }

  return out;
}

// x = ANY($1) -> x IN ($1); x != ALL($1) -> x NOT IN ($1).
// Array parameters are expanded into a placeholder list when bound.
function rewriteAnyAll(sql: string) {
  return sql
    .replace(/=\s*any\s*\(\s*(\$\d+)\s*(?:::\w+\[\])?\s*\)/gi, 'IN ($1)')
    .replace(/(?:!=|<>)\s*all\s*\(\s*(\$\d+)\s*(?:::\w+\[\])?\s*\)/gi, 'NOT IN ($1)');
}

// expr::type -> cast(expr as type)
function rewritePostfixCasts(sql: string) {
  return rewrite(sql, /::(\w+(?:\[\])?)/, (s, m) => {
    const start = operandStart(s, m.index);
    const operand = s.slice(start, m.index);
    const mapped = mapCastType(m[1]);

    return [start, m.index + m[0].length, mapped ? `cast(${operand} as ${mapped})` : operand];
  });
}

// cast(x as bigint) -> cast(x as signed), etc.
function rewriteCastTypes(sql: string) {
  return rewrite(sql, /\bcast\s*\(/i, (s, m) => {
    const open = m.index + m[0].length - 1;
    const close = matchForward(s, open);
    const inner = s.slice(open + 1, close);
    const parts = splitTopLevel(inner, ' as ');

    if (parts.length < 2) return null;

    const type = parts.pop().trim();
    const expr = parts.join(' as ');
    const match = type.match(/^(\w+)(?:\s+precision)?$/i);

    // already a MySQL type with arguments, e.g. decimal(65,10)
    if (!match) return null;

    const key = match[1].toLowerCase();
    const known = ['char', 'signed', 'unsigned', 'date', 'json', 'double', 'datetime', 'time'];

    if (known.includes(key)) return null;

    const mapped = mapCastType(key) ?? 'char';

    return [m.index, close + 1, `${s.slice(m.index, open)}(${expr} as ${mapped})`];
  });
}

function timezoneLiteral(tz: string) {
  return /^'utc'$/i.test(tz.trim()) ? "'+00:00'" : tz.trim();
}

// x at time zone 'tz' -> convert_tz(x, '+00:00', 'tz'). Stored datetimes are UTC.
function rewriteAtTimeZone(sql: string) {
  return rewrite(sql, /\s+at\s+time\s+zone\s+/i, (s, m) => {
    const start = operandStart(s, m.index);
    const tzStart = m.index + m[0].length;
    const tzEnd = operandEnd(s, tzStart);
    const operand = s.slice(start, m.index);
    const tz = timezoneLiteral(s.slice(tzStart, tzEnd));

    if (tz === "'+00:00'") return [start, tzEnd, operand];

    return [start, tzEnd, `convert_tz(${operand}, '+00:00', ${tz})`];
  });
}

// extract(epoch from a - b), extract(epoch from x), extract(dow from x)
function rewriteExtract(sql: string) {
  return rewrite(sql, /\bextract\s*\(\s*(epoch|dow|isodow)\s+from\s+/i, (s, m) => {
    const open = s.indexOf('(', m.index);
    const close = matchForward(s, open);
    let expr = s.slice(m.index + m[0].length, close).trim();
    const unit = m[1].toLowerCase();

    if (unit === 'dow') return [m.index, close + 1, `(dayofweek(${expr}) - 1)`];
    if (unit === 'isodow') return [m.index, close + 1, `weekday(${expr}) + 1`];

    // unwrap redundant parentheses
    while (expr.startsWith('(') && matchForward(expr, 0) === expr.length - 1) {
      expr = expr.slice(1, -1).trim();
    }

    const diff = splitTopLevel(expr, ' - ');

    if (diff.length === 2) {
      return [
        m.index,
        close + 1,
        `(timestampdiff(microsecond, ${diff[1].trim()}, ${diff[0].trim()}) / 1000000)`,
      ];
    }

    return [m.index, close + 1, `unix_timestamp(${expr})`];
  });
}

const TRUNC_FORMATS: Record<string, string> = {
  second: '%Y-%m-%d %H:%i:%s',
  minute: '%Y-%m-%d %H:%i:00',
  hour: '%Y-%m-%d %H:00:00',
  day: '%Y-%m-%d 00:00:00',
  month: '%Y-%m-01 00:00:00',
  year: '%Y-01-01 00:00:00',
};

// date_trunc('unit', x) -> datetime truncated to the unit.
function rewriteDateTrunc(sql: string) {
  return rewrite(sql, /\bdate_trunc\s*\(\s*'(\w+)'\s*,/i, (s, m) => {
    const open = s.indexOf('(', m.index);
    const close = matchForward(s, open);
    const expr = s.slice(m.index + m[0].length, close).trim();
    const unit = m[1].toLowerCase();

    if (unit === 'week') {
      return [
        m.index,
        close + 1,
        `cast(date_sub(date(${expr}), interval weekday(${expr}) day) as datetime)`,
      ];
    }

    if (!TRUNC_FORMATS[unit]) {
      throw new Error(`MySQL dialect: unsupported date_trunc unit "${unit}".`);
    }

    return [m.index, close + 1, `cast(date_format(${expr}, '${TRUNC_FORMATS[unit]}') as datetime)`];
  });
}

/** Converts a PostgreSQL to_char() format into a MySQL date_format() format. */
export function toMySQLDateFormat(format: string) {
  const tokens: [string, string][] = [
    ['YYYY', '%Y'],
    ['HH24', '%H'],
    ['MM', '%m'],
    ['DD', '%d'],
    ['MI', '%i'],
    ['SS', '%s'],
    ['Day', '%W'],
    ['Dy', '%a'],
  ];
  let out = '';

  for (let i = 0; i < format.length; ) {
    if (format[i] === '"') {
      const end = format.indexOf('"', i + 1);
      out += format.slice(i + 1, end).replaceAll('%', '%%');
      i = end + 1;
      continue;
    }

    const token = tokens.find(([pg]) => format.startsWith(pg, i));

    if (token) {
      out += token[1];
      i += token[0].length;
    } else {
      out += format[i] === '%' ? '%%' : format[i];
      i++;
    }
  }

  return out;
}

// to_char(x, 'fmt') -> date_format(x, 'fmt')
function rewriteToChar(sql: string) {
  return rewrite(sql, /\bto_char\s*\(/i, (s, m) => {
    const open = m.index + m[0].length - 1;
    const close = matchForward(s, open);
    const args = splitTopLevel(s.slice(open + 1, close), ',');
    const format = args.pop().trim();

    if (!/^'.*'$/s.test(format)) {
      throw new Error('MySQL dialect: to_char() format must be a literal.');
    }

    const mysqlFormat = toMySQLDateFormat(format.slice(1, -1).replaceAll("''", "'"));

    return [m.index, close + 1, `date_format(${args.join(',').trim()}, '${mysqlFormat}')`];
  });
}

// interval '5 minute' -> interval 5 minute
function rewriteIntervals(sql: string) {
  return sql.replace(
    /\binterval\s+'\s*(-?\d+)\s+(second|minute|hour|day|week|month|year)s?\s*'/gi,
    (_, n, unit) => `interval ${n} ${unit.toLowerCase()}`,
  );
}

// n * interval '4 hour' -> interval (n) * 4 hour; MySQL cannot multiply intervals.
function rewriteIntervalMultiplication(sql: string) {
  return rewrite(sql, /\*\s*interval\s+'\s*(\d+)\s+(\w+?)s?\s*'/i, (s, m) => {
    const start = operandStart(s, m.index);
    const operand = s.slice(start, m.index).trim();

    return [start, m.index + m[0].length, `interval (${operand}) * ${m[1]} ${m[2].toLowerCase()}`];
  });
}

// group by grouping sets ((a, b), (a)) -> group by a, b with rollup having grouping(a) = 0
// Only prefix chains (each set a prefix of the next) map onto ROLLUP.
function rewriteGroupingSets(sql: string) {
  return rewrite(sql, /\bgroup\s+by\s+grouping\s+sets\s*\(/i, (s, m) => {
    const open = m.index + m[0].length - 1;
    const close = matchForward(s, open);
    const sets = splitTopLevel(s.slice(open + 1, close), ',').map(set =>
      splitTopLevel(set.trim().replace(/^\(|\)$/g, ''), ',')
        .map(c => c.trim())
        .filter(Boolean),
    );
    const sorted = [...sets].sort((a, b) => b.length - a.length);
    const full = sorted[0];
    const isChain = sorted.every(
      (set, i) => set.length === full.length - i && set.every((c, j) => c === full[j]),
    );

    if (!isChain) {
      throw new Error('MySQL dialect: only prefix-chain grouping sets are supported.');
    }

    const minLength = sorted[sorted.length - 1].length;
    const having = minLength > 0 ? ` having grouping(${full[minLength - 1]}) = 0` : '';

    return [m.index, close + 1, `group by ${full.join(', ')} with rollup${having}`];
  });
}

// delete from a using b where ... -> delete a from a, b where ...
function rewriteDeleteUsing(sql: string) {
  return sql.replace(
    /\bdelete\s+from\s+(\w+)\s+using\s+(\w+)\b/gi,
    (_, target, other) => `delete ${target} from ${target}, ${other}`,
  );
}

// array_agg(x order by y) -> JSON array, ordered via group_concat
function rewriteArrayAgg(sql: string) {
  return rewrite(sql, /\barray_agg\s*\(/i, (s, m) => {
    const open = m.index + m[0].length - 1;
    const close = matchForward(s, open);
    const [expr, ...order] = splitTopLevel(s.slice(open + 1, close), ' order by ');
    const element = `json_array(${expr.trim()})`;
    // json_array(x) is '[x]'; strip the brackets to get x as a JSON element
    const item = `substring(${element}, 2, char_length(${element}) - 2)`;
    const orderBy = order.length ? ` order by ${order.join(' order by ').trim()}` : '';

    return [
      m.index,
      close + 1,
      `cast(concat('[', group_concat(${item}${orderBy} separator ','), ']') as json)`,
    ];
  });
}

// x in (select ... limit n) -> x in (select * from (select ... limit n) as t)
// MySQL rejects LIMIT directly inside an IN subquery but allows it in a derived table.
function rewriteLimitInSubquery(sql: string) {
  return rewrite(sql, /\bin\s*\(\s*select\b/i, (s, m) => {
    const open = s.indexOf('(', m.index);
    const close = matchForward(s, open);
    const inner = s.slice(open + 1, close);

    if (splitTopLevel(inner.toLowerCase(), 'limit ').length < 2) return null;

    return [open, close + 1, `(select * from (${inner}) as limited_subquery)`];
  });
}

// MySQL 8.0's semijoin rewrite of EXISTS/IN drops the correlation of a json_table()
// over an outer column and returns wrong results, so those subqueries opt out of it.
function rewriteJsonTableSemijoin(sql: string) {
  return rewrite(sql, /\b(exists|in)\s*\(\s*select\s+(?!\/\*\+)/i, (s, m) => {
    const open = s.indexOf('(', m.index);
    const close = matchForward(s, open);

    if (!/\bjson_table\s*\(/i.test(s.slice(open, close))) return null;

    const at = m.index + m[0].length;

    return [at, at, '/*+ NO_SEMIJOIN() */ '];
  });
}

/** Index of the first `token` (lower case) at parenthesis depth 0, or -1. */
function indexTopLevel(s: string, token: string, from = 0) {
  const lower = s.toLowerCase();
  let depth = 0;

  for (let i = from; i < s.length; i++) {
    const c = s[i];

    if (c === "'") {
      i = skipString(s, i, 1);
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
    } else if (depth === 0 && lower.startsWith(token, i)) {
      return i;
    }
  }

  return -1;
}

// select distinct on (k) cols from ... order by o
//   -> select * from (select cols, row_number() over (partition by k order by o) ...) where rank = 1
function rewriteDistinctOn(sql: string) {
  return rewrite(sql, /\bselect\s+distinct\s+on\s*\(/i, (s, m) => {
    const keyOpen = m.index + m[0].length - 1;
    const keyClose = matchForward(s, keyOpen);
    const key = s.slice(keyOpen + 1, keyClose);

    // the statement ends at the parenthesis enclosing it, or the end of the SQL
    let end = s.length;
    for (let i = m.index, depth = 0; i < s.length; i++) {
      if (s[i] === "'") i = skipString(s, i, 1);
      else if (s[i] === '(') depth++;
      else if (s[i] === ')' && --depth < 0) {
        end = i;
        break;
      }
    }

    const body = s.slice(keyClose + 1, end);
    const fromIndex = indexTopLevel(body, ' from ');
    const columns = body.slice(0, fromIndex);
    let rest = body.slice(fromIndex);
    let order = key;
    const orderIndex = indexTopLevel(rest, 'order by ');

    if (orderIndex >= 0) {
      order = rest.slice(orderIndex + 'order by '.length).trim();
      rest = rest.slice(0, orderIndex);
    }

    return [
      m.index,
      end,
      `select * from (select ${columns.trim()}, row_number() over (partition by ${key} order by ${order}) as distinct_on_rank ${rest.trim()}) as distinct_on where distinct_on_rank = 1`,
    ];
  });
}

/** Start and end of the innermost SELECT statement containing `index`. */
function enclosingSelect(s: string, index: number) {
  let i = index;

  for (;;) {
    let open = -1;

    for (let depth = 0; i >= 0; i--) {
      if (s[i] === "'") i = skipString(s, i, -1);
      else if (s[i] === ')') depth++;
      else if (s[i] === '(' && --depth < 0) {
        open = i;
        break;
      }
    }

    if (open < 0) {
      return { start: s.search(/\S/), end: s.length };
    }

    if (/^\s*select\b/i.test(s.slice(open + 1))) {
      return { start: open + 1 + s.slice(open + 1).search(/\S/), end: matchForward(s, open) };
    }

    i = open - 1;
  }
}

function columnAlias(item: string) {
  const alias = item.match(/\s+as\s+("?)(\w+)\1\s*$/i);

  if (alias) return { expr: item.slice(0, alias.index), name: alias[2] };

  const column = item.trim().match(/(?:^|\.)"?(\w+)"?$/);

  return { expr: item, name: column?.[1] };
}

// mode() within group (order by x): MySQL has no such aggregate. The statement is
// wrapped: the inner query collects each group's values with json_arrayagg(), the
// outer query picks the most frequent (ties: the smallest, as PostgreSQL does).
function rewriteMode(sql: string) {
  const pattern = /\bmode\s*\(\s*\)\s*within\s+group\s*\(\s*order\s+by\s+/i;

  return rewrite(sql, pattern, (s, m) => {
    const { start, end } = enclosingSelect(s, m.index);
    const statement = s.slice(start, end);
    const fromIndex = indexTopLevel(statement, ' from ');
    const items = splitTopLevel(statement.slice('select'.length, fromIndex), ',');
    const inner: string[] = [];
    const outer: string[] = [];
    let n = 0;

    for (const item of items) {
      const { expr, name } = columnAlias(item.trim());

      if (!pattern.test(expr)) {
        inner.push(item.trim());
        outer.push(`mode_source."${name}"`);
        continue;
      }

      const outerExpr = rewrite(expr, pattern, (e, em) => {
        const open = e.indexOf('(', e.toLowerCase().indexOf('within', em.index));
        const close = matchForward(e, open);
        const value = e.slice(em.index + em[0].length, close).trim();
        const column = `mode_values_${n++}`;

        inner.push(`json_arrayagg(${value}) as ${column}`);

        return [
          em.index,
          close + 1,
          `(select jt.v from json_table(mode_source.${column}, '$[*]' columns(v json path '$')) as jt where json_type(jt.v) != 'NULL' group by jt.v order by count(*) desc, jt.v limit 1)`,
        ];
      });

      outer.push(`${outerExpr} as "${name}"`);
    }

    return [
      start,
      end,
      `select ${outer.join(', ')} from (select ${inner.join(', ')} ${statement.slice(fromIndex).trim()}) as mode_source`,
    ];
  });
}

// x ilike y -> x like y collate <case-insensitive> escape '\'
// PostgreSQL's LIKE escapes with a backslash by default; with NO_BACKSLASH_ESCAPES
// MySQL's LIKE has no escape character unless one is given.
function rewriteLike(sql: string) {
  return rewrite(sql, /\b(not\s+)?(i?)like\s+/i, (s, m) => {
    const end = operandEnd(s, m.index + m[0].length);

    if (/^\s+(collate|escape)\b/i.test(s.slice(end))) return null;

    const rhs = s.slice(m.index + m[0].length, end);
    const collate = m[2] ? ` collate ${CI_COLLATION}` : '';
    // A literal without a backslash needs no ESCAPE (which MySQL rejects in some
    // GROUP BY expressions).
    const escapeClause = /^'[^\\]*'$/.test(rhs.trim()) ? '' : ` escape '\\'`;

    if (!collate && !escapeClause) return null;

    return [m.index, end, `${m[1] ?? ''}like ${rhs}${collate}${escapeClause}`];
  });
}

// x ~* y -> regexp_like(x, y, 'i'); x !~ y -> not regexp_like(x, y, 'c')
function rewriteRegex(sql: string) {
  return rewrite(sql, /\s(!?)~(\*?)\s/, (s, m) => {
    const start = operandStart(s, m.index);
    const end = operandEnd(s, m.index + m[0].length);
    const lhs = s.slice(start, m.index).trim();
    const rhs = s.slice(m.index + m[0].length, end).trim();
    const flags = m[2] ? 'i' : 'c';

    return [start, end, `${m[1] ? 'not ' : ''}regexp_like(${lhs}, ${rhs}, '${flags}')`];
  });
}

// bool_or(x) -> max(x), bool_and(x) -> min(x)
function rewriteBoolAggregates(sql: string) {
  return sql.replace(/\bbool_or\s*\(/gi, 'max(').replace(/\bbool_and\s*\(/gi, 'min(');
}

// [cross join lateral] jsonb_array_elements_text(x) as alias(col) -> json_table(...)
function rewriteJsonArrayElements(sql: string) {
  return rewrite(sql, /(\blateral\s+)?\bjsonb?_array_elements_text\s*\(/i, (s, m) => {
    const open = m.index + m[0].length - 1;
    const close = matchForward(s, open);
    // json_valid() must see the text, before any cast to json can fail
    const expr = s
      .slice(open + 1, close)
      .trim()
      .replace(/^cast\(([\s\S]*) as json\)$/i, '$1');
    const alias = s.slice(close + 1).match(/^\s+as\s+(\w+)\s*\(\s*(\w+)\s*\)/i);

    if (!alias) {
      throw new Error('MySQL dialect: jsonb_array_elements_text() needs an alias(column).');
    }

    // PostgreSQL only reaches this for array rows; MySQL may evaluate it for any row,
    // so values that are not JSON are treated as an empty array instead of failing.
    const json = `case when json_valid(${expr}) then ${expr} else '[]' end`;

    return [
      m.index,
      close + 1 + alias[0].length,
      `json_table(${json}, '$[*]' columns(${alias[2]}${JSON_COLUMN_SUFFIX} varchar(500) collate utf8mb4_0900_as_cs path '$')) as ${alias[1]}`,
    ];
  });
}

// A json_table column named `value` matches nothing inside a correlated EXISTS
// (MySQL 8.0), so the column gets a suffix and references to it follow.
const JSON_COLUMN_SUFFIX = '_json';

function rewriteJsonTableColumns(sql: string) {
  const aliases = [
    ...sql.matchAll(/\bjsonb?_array_elements_text\s*\([\s\S]*?\)\s+as\s+(\w+)\s*\(\s*(\w+)\s*\)/gi),
  ];

  return aliases.reduce(
    (out, [, alias, column]) =>
      out.replace(
        new RegExp(`\\b${alias}\\.${column}\\b`, 'g'),
        `${alias}.${column}${JSON_COLUMN_SUFFIX}`,
      ),
    sql,
  );
}

// percentile_cont(p) within group (order by x) -> interpolated value from a sorted
// group_concat() of x. Requires a large group_concat_max_len (see MYSQL_SESSION_SQL).
function rewritePercentileCont(sql: string) {
  return rewrite(
    sql,
    /\bpercentile_cont\s*\(\s*([\d.]+)\s*\)\s*within\s+group\s*\(\s*order\s+by\s+/i,
    (s, m) => {
      const open = s.indexOf('(', s.toLowerCase().indexOf('within', m.index));
      const close = matchForward(s, open);
      const x = s
        .slice(m.index + m[0].length, close)
        .trim()
        .replace(/\s+asc$/i, '');
      const p = m[1];
      const n = `count(${x})`;
      const pos = `${p} * (${n} - 1)`;
      const list = `group_concat(${x} order by ${x} separator ',')`;
      const at = (index: string) =>
        `cast(substring_index(substring_index(${list}, ',', ${index} + 1), ',', -1) as double)`;
      const lo = at(`floor(${pos})`);
      const hi = at(`ceil(${pos})`);

      return [
        m.index,
        close + 1,
        `(case when ${n} = 0 then null else ${lo} + (${pos} - floor(${pos})) * (${hi} - ${lo}) end)`,
      ];
    },
  );
}

// insert ... on conflict (...) do nothing / do update set a = excluded.a
function rewriteOnConflict(sql: string) {
  const doNothing = /\bon\s+conflict\s*(\([^)]*\))?\s*do\s+nothing/i;

  if (doNothing.test(sql)) {
    return sql.replace(doNothing, '').replace(/\binsert\s+into\b/i, 'insert ignore into');
  }

  return sql.replace(
    /\bon\s+conflict\s*(\([^)]*\))?\s*do\s+update\s+set\b([\s\S]*)$/i,
    (_, _cols, assignments) =>
      `on duplicate key update${assignments.replace(/\bexcluded\.(\w+)/gi, 'values($1)')}`,
  );
}

const RULES: ((sql: string) => string)[] = [
  rewriteAnyAll,
  rewritePostfixCasts,
  rewriteCastTypes,
  rewriteAtTimeZone,
  rewriteExtract,
  rewriteDateTrunc,
  rewriteToChar,
  rewriteIntervalMultiplication,
  rewriteIntervals,
  rewriteGroupingSets,
  rewriteDeleteUsing,
  rewriteArrayAgg,
  rewriteLimitInSubquery,
  rewriteDistinctOn,
  rewriteMode,
  rewriteLike,
  rewriteRegex,
  rewriteBoolAggregates,
  rewriteJsonTableColumns,
  rewriteJsonArrayElements,
  rewritePercentileCont,
  rewriteOnConflict,
  // after every rule that can produce json_table()
  rewriteJsonTableSemijoin,
];

/**
 * Aliases of select-list predicates such as `(x is not null) as "hasData"`.
 * PostgreSQL returns booleans for these; MySQL returns 0/1, so the client converts
 * them back.
 */
export function getBooleanAliases(sql: string) {
  const aliases = new Set<string>();
  const pattern = /\)\s+as\s+"?(\w+)"?/gi;

  for (const match of sql.matchAll(pattern)) {
    const open = matchBackward(sql, match.index);
    const before = sql.slice(0, open).trimEnd();
    const expr = sql.slice(open + 1, match.index);
    const isExists = /\bexists$/i.test(before);
    // `coalesce(...) as x` is a function call, `select (...) as x` is not
    const isCall = /\w$/.test(before) && !/\b(select|and|or|not|then|else|when)$/i.test(before);
    const isPredicate =
      !isCall &&
      !/^\s*select\b/i.test(expr) &&
      (/\bis\s+(not\s+)?null\s*$/i.test(expr) ||
        splitTopLevel(expr, ' = ').length === 2 ||
        splitTopLevel(expr, ' != ').length === 2);

    if (isExists || isPredicate) aliases.add(match[1]);
  }

  return aliases;
}

/** Rewrites a PostgreSQL raw query (with $1 placeholders) for MySQL. */
export function toMySQL(sql: string) {
  // `--` comments may contain quotes or keywords; drop them first.
  return RULES.reduce((out, rule) => rule(out), stripComments(sql));
}

/**
 * Replaces PostgreSQL's numbered `$1` placeholders with MySQL's positional `?`.
 * Array values expand into a parameter list (for the IN lists produced by the ANY/ALL
 * rewrite); an empty array becomes an empty subquery, so `IN` matches nothing and
 * `NOT IN` matches everything, like PostgreSQL's ANY/ALL over an empty array.
 */
export function bindMySQLParams(sql: string, values: unknown[]) {
  const params: unknown[] = [];
  let query = '';

  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") {
      const end = skipString(sql, i, 1);
      query += sql.slice(i, end + 1);
      i = end;
      continue;
    }

    const match = sql[i] === '$' && sql.slice(i).match(/^\$(\d+)/);

    if (!match) {
      query += sql[i];
      continue;
    }

    const value = values[Number(match[1]) - 1];

    if (Array.isArray(value)) {
      params.push(...value);
      query += value.length ? value.map(() => '?').join(', ') : 'select null from dual where false';
    } else {
      params.push(value);
      query += '?';
    }

    i += match[0].length - 1;
  }

  return { query, params };
}
