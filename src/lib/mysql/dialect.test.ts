import { describe, expect, test } from 'vitest';
import { bindMySQLParams, getBooleanAliases, toMySQL, toMySQLDateFormat } from './dialect';

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const mysql = (sql: string) => squash(toMySQL(sql));

describe('toMySQL', () => {
  test('drops uuid casts and maps other casts', () => {
    expect(mysql('where id = $1::uuid and d < $2::date')).toBe(
      'where id = $1 and d < cast($2 as date)',
    );
    expect(mysql('count(*)::int as c, (a + b)::bigint, x::text')).toBe(
      'cast(count(*) as signed) as c, cast((a + b) as signed), cast(x as char)',
    );
    expect(mysql('cast(sum(x) as bigint), cast(n as decimal), cast(v as varchar)')).toBe(
      'cast(sum(x) as signed), cast(n as decimal(65,10)), cast(v as char)',
    );
  });

  test('rewrites ANY/ALL over array parameters as IN lists', () => {
    expect(mysql('a = ANY($1) and b != ALL($2) and c = any($3::uuid[])')).toBe(
      'a IN ($1) and b NOT IN ($2) and c IN ($3)',
    );
  });

  test('converts time zones, truncation and formatting', () => {
    expect(
      mysql(
        `to_char(date_trunc('day', created_at at time zone 'America/New_York'), 'YYYY-MM-DD"T"HH24:00:00"Z"')`,
      ),
    ).toBe(
      "date_format(cast(date_format(convert_tz(created_at, '+00:00', 'America/New_York'), '%Y-%m-%d 00:00:00') as datetime), '%Y-%m-%dT%H:00:00Z')",
    );
    expect(mysql("x at time zone 'utc'")).toBe('x');
    expect(mysql('x at time zone $1')).toBe("convert_tz(x, '+00:00', $1)");
    expect(mysql("date_trunc('week', x)")).toBe(
      'cast(date_sub(date(x), interval weekday(x) day) as datetime)',
    );
  });

  test('converts epoch and day-of-week extraction', () => {
    expect(mysql('extract(epoch from (b - a))')).toBe(
      '(timestampdiff(microsecond, a, b) / 1000000)',
    );
    expect(mysql('extract(epoch from x)')).toBe('unix_timestamp(x)');
    expect(mysql('extract(dow from x)')).toBe('(dayofweek(x) - 1)');
  });

  test('converts interval literals and interval multiplication', () => {
    expect(mysql("now() - interval '5 minutes'")).toBe('now() - interval 5 minute');
    expect(mysql("d + floor(h / 4) * interval '4 hour'")).toBe(
      'd + interval (floor(h / 4)) * 4 hour',
    );
  });

  test('emulates ILIKE, LIKE escapes and regex operators', () => {
    expect(mysql("a ilike $1 or b not ilike '%x%'")).toBe(
      "a like $1 collate utf8mb4_0900_as_ci escape '\\' or b not like '%x%' collate utf8mb4_0900_as_ci",
    );
    expect(mysql("a like '%a\\_b%' or b like 'p%'")).toBe(
      "a like '%a\\_b%' escape '\\' or b like 'p%'",
    );
    expect(mysql('h.url_path ~* $1 and x !~* $2')).toBe(
      "regexp_like(h.url_path, $1, 'i') and not regexp_like(x, $2, 'i')",
    );
  });

  test('maps aggregates', () => {
    expect(mysql('bool_or(a = 1) and bool_and(b)')).toBe('max(a = 1) and min(b)');
    expect(mysql('percentile_cont(0.5) within group (order by lcp)')).toContain(
      "group_concat(lcp order by lcp separator ',')",
    );
    expect(mysql('array_agg(k order by k asc)')).toBe(
      "cast(concat('[', group_concat(substring(json_array(k), 2, char_length(json_array(k)) - 2) order by k asc separator ','), ']') as json)",
    );
  });

  test('converts jsonb_array_elements_text to a guarded json_table', () => {
    const sql = mysql(
      "exists (select 1 from jsonb_array_elements_text(coalesce(v, '[]')::jsonb) as item(value) where item.value = $1)",
    );

    expect(sql).toContain("json_table(case when json_valid(coalesce(v, '[]'))");
    expect(sql).toContain('columns(value_json varchar(500)');
    expect(sql).toContain('item.value_json = $1');
    expect(sql).toContain('select /*+ NO_SEMIJOIN() */ 1');
  });

  test('rewrites upserts', () => {
    expect(mysql('insert into t (a) values ($1) on conflict (a) do nothing')).toBe(
      'insert ignore into t (a) values ($1)',
    );
    expect(
      mysql('insert into t (a, b) values ($1, $2) on conflict (a) do update set b = excluded.b'),
    ).toBe('insert into t (a, b) values ($1, $2) on duplicate key update b = values(b)');
  });

  test('rewrites statements MySQL structures differently', () => {
    expect(mysql('delete from a using b where a.id = b.id')).toBe(
      'delete a from a, b where a.id = b.id',
    );
    expect(mysql('select a, x from t group by grouping sets ((a, x), (a))')).toBe(
      'select a, x from t group by a, x with rollup having grouping(a) = 0',
    );
    expect(mysql('x in (select y from t order by z limit 5)')).toBe(
      'x in (select * from (select y from t order by z limit 5) as limited_subquery)',
    );
    expect(
      mysql('join (select distinct on (v) v, p from t where a = 1 order by v, c desc) x on true'),
    ).toBe(
      'join (select * from (select v, p, row_number() over (partition by v order by v, c desc) as distinct_on_rank from t where a = 1) as distinct_on where distinct_on_rank = 1) x on true',
    );
  });

  test('emulates mode() by wrapping the grouped statement', () => {
    const sql = mysql(
      '(select g, (mode() within group (order by w))::int as w from t group by g) s',
    );

    expect(sql).toMatch(/^\(select mode_source\."g", cast\(\(\(select jt\.v from json_table/);
    expect(sql).toContain(
      'from (select g, json_arrayagg(w) as mode_values_0 from t group by g) as mode_source) s',
    );
  });

  test('ignores comments and string literals', () => {
    expect(mysql("select 'a::b ilike' -- it's ::int\nfrom t")).toBe("select 'a::b ilike' from t");
  });
});

describe('toMySQLDateFormat', () => {
  test('maps PostgreSQL format tokens', () => {
    expect(toMySQLDateFormat('YYYY-MM-DD"T"HH24:MI:SS"Z"')).toBe('%Y-%m-%dT%H:%i:%sZ');
    expect(toMySQLDateFormat('HH24')).toBe('%H');
  });
});

describe('bindMySQLParams', () => {
  test('maps numbered placeholders to positional ones', () => {
    expect(bindMySQLParams('a = $2 and b = $1 and c = $2', ['x', 'y'])).toEqual({
      query: 'a = ? and b = ? and c = ?',
      params: ['y', 'x', 'y'],
    });
  });

  test('expands arrays and leaves literals alone', () => {
    expect(bindMySQLParams("a IN ($1) and b = '$1'", [['p', 'q']])).toEqual({
      query: "a IN (?, ?) and b = '$1'",
      params: ['p', 'q'],
    });
    expect(bindMySQLParams('a NOT IN ($1)', [[]]).query).toBe(
      'a NOT IN (select null from dual where false)',
    );
  });
});

describe('getBooleanAliases', () => {
  test('finds predicate columns', () => {
    expect([
      ...getBooleanAliases(
        'select (e.id is not null) as "hasData", (a = b) as same, (select count(*) from t where x = y) as total, coalesce(a, b) as c',
      ),
    ]).toEqual(['hasData', 'same']);
  });
});
