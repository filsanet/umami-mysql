import { DATA_TYPE, OPERATORS } from '@/lib/constants';
import { END, START, WEBSITE_2_ID, WEBSITE_ID } from './dataset';

/**
 * The query catalogue for the parity suite: every relational query in
 * src/queries/sql, called with filter combinations that hit each SQL branch.
 * Results from PostgreSQL and MySQL must match exactly (after normalization).
 *
 * When upstream adds a query, add it here. scripts/mysql/check-coverage.ts fails
 * CI for any exported query function that no case calls.
 */

export interface ParityCase {
  name: string;
  run: () => Promise<unknown>;
  /** Results depend on the current time; compare their shape and counts only. */
  volatile?: boolean;
  /**
   * Rows are ranked by this field and cut at a LIMIT, so which of the rows tied
   * at the cut-off get returned is up to the database. Those rows are ignored.
   */
  tiedAtLimit?: string;
}

const startDate = START;
const endDate = END;
const midDate = new Date('2024-03-20T12:00:00.000Z');

const TIMEZONES = ['UTC', 'America/New_York', 'Europe/Berlin', 'Asia/Kolkata', 'Pacific/Auckland'];
const UNITS = ['hour', 'day', 'month'];

/** Filter sets covering every operator and the session/event column split. */
const FILTERS: Record<string, Record<string, any>> = {
  none: {},
  pathEquals: { path: `${OPERATORS.equals}./pricing` },
  pathEqualsMany: { path: `${OPERATORS.equals}./pricing,/About` },
  pathNotEquals: { path: `${OPERATORS.notEquals}./` },
  pathContains: { path: `${OPERATORS.contains}.blog` },
  pathContainsCase: { path: `${OPERATORS.contains}.ABOUT` },
  pathNotContains: { path: `${OPERATORS.doesNotContain}.docs` },
  pathRegex: { path: `${OPERATORS.regex}.^/(about|pricing)$` },
  pathNotRegex: { path: `${OPERATORS.notRegex}.^/blog` },
  titleUnicode: { title: `${OPERATORS.contains}.Café` },
  titleQuote: { title: `${OPERATORS.contains}."World"` },
  referrer: { referrer: `${OPERATORS.contains}.google` },
  browser: { browser: `${OPERATORS.equals}.chrome` },
  countryCity: { country: `${OPERATORS.equals}.US`, city: `${OPERATORS.notEquals}.New York` },
  matchAny: { browser: `${OPERATORS.equals}.firefox`, os: `${OPERATORS.equals}.iOS`, match: 'any' },
  event: { event: `${OPERATORS.equals}.signup` },
  tag: { tag: `${OPERATORS.equals}.A/B: variant` },
  utm: { utmSource: `${OPERATORS.contains}.google` },
  hostname: { hostname: `${OPERATORS.equals}.www.example.test` },
  excludeBounce: { excludeBounce: true },
  cohort: {
    cohort_browser: `${OPERATORS.equals}.chrome`,
    cohort_startDate: startDate,
    cohort_endDate: midDate,
  },
  eventProperty: {
    eventPropertyFilters: [
      {
        propertyName: 'plan',
        dataType: DATA_TYPE.string,
        operator: OPERATORS.equals,
        value: 'pro',
      },
    ],
  },
  sessionProperty: {
    sessionPropertyFilters: [
      {
        propertyName: 'employees',
        dataType: DATA_TYPE.number,
        operator: OPERATORS.greaterThan,
        value: '1000',
      },
    ],
  },
};

const base = (extra: Record<string, any> = {}) => ({
  startDate,
  endDate,
  timezone: 'UTC',
  unit: 'day',
  ...extra,
});

const PROPERTY_FILTERS = [
  {
    propertyName: 'plan',
    dataType: DATA_TYPE.string,
    operator: OPERATORS.equals,
    value: 'pro,Pro',
  },
  { propertyName: 'plan', dataType: DATA_TYPE.string, operator: OPERATORS.contains, value: 'PR' },
  { propertyName: 'plan', dataType: DATA_TYPE.string, operator: OPERATORS.regex, value: '^ent' },
  {
    propertyName: 'seats',
    dataType: DATA_TYPE.number,
    operator: OPERATORS.greaterThanEquals,
    value: '10',
  },
  { propertyName: 'trial', dataType: DATA_TYPE.boolean, operator: OPERATORS.equals, value: 'true' },
  {
    propertyName: 'releasedAt',
    dataType: DATA_TYPE.date,
    operator: OPERATORS.after,
    value: '2023-12-01',
  },
  { propertyName: 'tags', dataType: DATA_TYPE.array, operator: OPERATORS.contains, value: 'a' },
  {
    propertyName: 'tags',
    dataType: DATA_TYPE.array,
    operator: OPERATORS.doesNotContain,
    value: 'b',
  },
];

export async function getCases(): Promise<ParityCase[]> {
  const sql = await import('@/queries/sql');
  const { getAttribution } = await import('@/queries/sql/attribution/getAttribution');
  const { getGoal } = await import('@/queries/sql/goals/getGoal');
  const { getRevenueChart } = await import('@/queries/sql/revenue/getRevenueChart');
  const { getRevenueMetrics } = await import('@/queries/sql/revenue/getRevenueMetrics');
  const { getRevenueSessions } = await import('@/queries/sql/revenue/getRevenueSessions');
  const { getRevenueStats } = await import('@/queries/sql/revenue/getRevenueStats');
  const { getPerformanceStats } = await import('@/queries/sql/performance/getPerformanceStats');
  const { getPerformanceMetrics } = await import('@/queries/sql/performance/getPerformanceMetrics');
  const { getPerformanceChart } = await import('@/queries/sql/performance/getPerformanceChart');
  const { getEventData } = await import('@/queries/sql/events/getEventData');
  const { getWebsiteEventStats } = await import('@/queries/sql/events/getWebsiteEventStats');

  const cases: ParityCase[] = [];
  const add = (name: string, run: () => Promise<unknown>, volatile = false, tiedAtLimit?: string) =>
    cases.push({ name, run, volatile, tiedAtLimit });

  // Filters x the core stats queries
  for (const [label, filter] of Object.entries(FILTERS)) {
    const filters = base(filter);
    add(`getWebsiteStats/${label}`, () => sql.getWebsiteStats(WEBSITE_ID, filters));
    add(`getPageviewStats/${label}`, () => sql.getPageviewStats(WEBSITE_ID, filters));
    add(`getSessionStats/${label}`, () => sql.getSessionStats(WEBSITE_ID, filters));
    add(`getPageviewMetrics/path/${label}`, () =>
      sql.getPageviewMetrics(WEBSITE_ID, { type: 'path', limit: 500 }, filters),
    );
    add(`getSessionMetrics/browser/${label}`, () =>
      sql.getSessionMetrics(WEBSITE_ID, { type: 'browser', limit: 500 }, filters),
    );
    add(`getWebsiteSessionStats/${label}`, () => sql.getWebsiteSessionStats(WEBSITE_ID, filters));
    add(`getWebsiteEvents/${label}`, () =>
      sql.getWebsiteEvents(WEBSITE_ID, { ...filters, pageSize: 50, page: 2 } as any),
    );
  }

  // Timezones and units (date bucketing, DST)
  for (const timezone of TIMEZONES) {
    for (const unit of UNITS) {
      const filters = base({ timezone, unit });
      add(`getPageviewStats/${timezone}/${unit}`, () => sql.getPageviewStats(WEBSITE_ID, filters));
      add(`getSessionStats/${timezone}/${unit}`, () => sql.getSessionStats(WEBSITE_ID, filters));
      add(`getEventStats/${timezone}/${unit}`, () =>
        sql.getEventStats(WEBSITE_ID, { limit: 3 }, filters),
      );
    }

    const filters = base({ timezone });
    add(`getWeeklyTraffic/${timezone}`, () => sql.getWeeklyTraffic(WEBSITE_ID, filters));
    add(`getRetention/${timezone}`, () =>
      sql.getRetention(WEBSITE_ID, { startDate, endDate, timezone }, filters),
    );
    add(`getWebsiteListCharts/${timezone}`, () =>
      sql.getWebsiteListCharts([WEBSITE_ID, WEBSITE_2_ID], { startDate, endDate, timezone } as any),
    );
    add(`getRevenueChart/${timezone}`, () =>
      getRevenueChart(
        WEBSITE_ID,
        { startDate, endDate, unit: 'day', timezone, currency: 'USD' },
        filters,
      ),
    );
    add(`getPerformanceChart/${timezone}`, () =>
      getPerformanceChart(
        WEBSITE_ID,
        { startDate, endDate, unit: 'day', timezone, metric: 'lcp' },
        filters,
      ),
    );
  }

  // Every metric type
  for (const type of [
    'path',
    'entry',
    'exit',
    'referrer',
    'domain',
    'title',
    'query',
    'tag',
    'hostname',
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'fullPath',
  ]) {
    add(`getPageviewMetrics/${type}`, () =>
      sql.getPageviewMetrics(WEBSITE_ID, { type, limit: 500 }, base()),
    );
    add(`getPageviewExpandedMetrics/${type}`, () =>
      sql.getPageviewExpandedMetrics(WEBSITE_ID, { type, limit: 500 }, base()),
    );
  }

  add('getPageviewMetrics/path/search', () =>
    sql.getPageviewMetrics(WEBSITE_ID, { type: 'fullPath', limit: 500 }, base({ search: 'REF=' })),
  );
  add('getPageviewMetrics/path/offset', () =>
    sql.getPageviewMetrics(WEBSITE_ID, { type: 'path', limit: 3, offset: 2 }, base()),
  );

  for (const type of [
    'browser',
    'os',
    'device',
    'screen',
    'language',
    'country',
    'region',
    'city',
    'distinctId',
  ]) {
    add(`getSessionMetrics/${type}`, () =>
      sql.getSessionMetrics(WEBSITE_ID, { type, limit: 500 }, base()),
    );
    add(`getSessionExpandedMetrics/${type}`, () =>
      sql.getSessionExpandedMetrics(WEBSITE_ID, { type, limit: 500 }, base()),
    );
  }

  add('getEventMetrics', () => sql.getEventMetrics(WEBSITE_ID, { type: 'event' }, base()));
  add('getEventExpandedMetrics', () =>
    sql.getEventExpandedMetrics(WEBSITE_ID, { type: 'event' }, base()),
  );
  add('getChannelMetrics', () => sql.getChannelMetrics(WEBSITE_ID, base()));
  add('getChannelMetrics/filtered', () => sql.getChannelMetrics(WEBSITE_ID, base(FILTERS.browser)));
  add('getChannelExpandedMetrics', () => sql.getChannelExpandedMetrics(WEBSITE_ID, base()));

  for (const column of [
    'url_path',
    'referrer_domain',
    'page_title',
    'event_name',
    'browser',
    'city',
    'utm_source',
  ]) {
    add(`getValues/${column}`, () => sql.getValues(WEBSITE_ID, column, base()));
    add(`getValues/${column}/search`, () =>
      sql.getValues(WEBSITE_ID, column, base({ search: 'O' })),
    );
  }

  // the latest event is part of the realtime data, relative to now
  add('getWebsiteDateRange', () => sql.getWebsiteDateRange(WEBSITE_ID), true);
  add('getBreakdown', () =>
    sql.getBreakdown(WEBSITE_ID, { startDate, endDate, fields: ['path', 'browser'] }, base()),
  );
  add('getBreakdown/country', () =>
    sql.getBreakdown(
      WEBSITE_ID,
      { startDate, endDate, fields: ['country', 'device'] },
      base(FILTERS.pathContains),
    ),
  );

  // Sessions
  add('getWebsiteSessions', () =>
    sql.getWebsiteSessions(WEBSITE_ID, base({ pageSize: 100 }) as any),
  );
  add('getWebsiteSessions/search', () =>
    sql.getWebsiteSessions(WEBSITE_ID, base({ search: 'LONDON', pageSize: 100 }) as any),
  );
  add('getWebsiteSessions/page2', () =>
    sql.getWebsiteSessions(WEBSITE_ID, base({ pageSize: 25, page: 2 }) as any),
  );
  add('getWebsiteEvents/search', () =>
    sql.getWebsiteEvents(WEBSITE_ID, base({ search: 'SIGN', pageSize: 100 }) as any),
  );
  add('getEventDataEvents', () => sql.getEventDataEvents(WEBSITE_ID, base()));
  add('getEventData', () => getEventData(WEBSITE_ID, base()));
  add('getWebsiteEventStats', () => getWebsiteEventStats(WEBSITE_ID, base()));

  const prisma = (await import('@/lib/prisma')).default;
  const [firstSession] = (await prisma.rawQuery(
    `select session_id from session where website_id = {{websiteId::uuid}} and distinct_id is not null order by created_at, session_id limit 1`,
    { websiteId: WEBSITE_ID },
  )) as { session_id: string }[];
  const sessionId = firstSession.session_id;
  const [firstEvent] = (await prisma.rawQuery(
    `select website_event_id from event_data where website_id = {{websiteId::uuid}} order by created_at, website_event_id limit 1`,
    { websiteId: WEBSITE_ID },
  )) as { website_event_id: string }[];
  const [firstReplay] = (await prisma.rawQuery(
    `select visit_id from session_replay where website_id = {{websiteId::uuid}} order by created_at, visit_id limit 1`,
    { websiteId: WEBSITE_ID },
  )) as { visit_id: string }[];

  add('getWebsiteSession', () => sql.getWebsiteSession(WEBSITE_ID, sessionId));
  add('getSessionData', () => sql.getSessionData(WEBSITE_ID, sessionId));
  add('getSessionActivity', () => sql.getSessionActivity(WEBSITE_ID, [sessionId], base()));
  add('getLinkedDistinctIds', () => sql.getLinkedDistinctIds(WEBSITE_ID, sessionId));
  // includes a realtime session, created relative to now
  add('getLinkedSessionIds', () => sql.getLinkedSessionIds(WEBSITE_ID, 'user-1'), true);
  add('getEventDataById', () => sql.getEventDataById(WEBSITE_ID, firstEvent.website_event_id));

  // Event data
  add('getEventDataFields', () => sql.getEventDataFields(WEBSITE_ID, undefined, base()));
  add('getEventDataFields/signup', () => sql.getEventDataFields(WEBSITE_ID, 'signup', base()));
  add('getEventDataProperties', () => sql.getEventDataProperties(WEBSITE_ID, base()));
  add('getEventDataProperties/plan', () =>
    sql.getEventDataProperties(WEBSITE_ID, base({ propertyName: 'plan' })),
  );
  add('getEventDataStats', () => sql.getEventDataStats(WEBSITE_ID, base()));

  for (const [eventName, propertyName, dataType] of [
    ['signup', 'plan', DATA_TYPE.string],
    ['signup', 'seats', DATA_TYPE.number],
    ['signup', 'trial', DATA_TYPE.boolean],
    ['signup', 'tags', DATA_TYPE.array],
    ['download', 'releasedAt', DATA_TYPE.date],
    ['purchase', 'coupon', DATA_TYPE.string],
  ] as const) {
    const filters = base({ propertyName, dataType });
    add(`getEventDataValues/${eventName}/${propertyName}`, () =>
      sql.getEventDataValues(WEBSITE_ID, eventName, filters),
    );
    add(`getEventDataPropertySeries/${propertyName}`, () =>
      sql.getEventDataPropertySeries(WEBSITE_ID, eventName, propertyName, base()),
    );
  }

  for (const timezone of ['UTC', 'America/New_York']) {
    for (const metric of ['sum', 'avg', 'count'] as const) {
      add(`getEventDataNumericSeries/${metric}/${timezone}`, () =>
        sql.getEventDataNumericSeries(WEBSITE_ID, 'signup', 'seats', metric, base({ timezone })),
      );
      add(`getSessionDataNumericSeries/${metric}/${timezone}`, () =>
        sql.getSessionDataNumericSeries(WEBSITE_ID, 'employees', metric, base({ timezone })),
      );
    }
    add(`getEventDataArraySeries/${timezone}`, () =>
      sql.getEventDataArraySeries(WEBSITE_ID, 'signup', 'tags', base({ timezone })),
    );
    add(`getEventDataDateSeries/${timezone}`, () =>
      sql.getEventDataDateSeries(WEBSITE_ID, 'download', 'releasedAt', base({ timezone })),
    );
    add(`getSessionDataArraySeries/${timezone}`, () =>
      sql.getSessionDataArraySeries(WEBSITE_ID, 'roles', base({ timezone })),
    );
    add(`getSessionDataDateSeries/${timezone}`, () =>
      sql.getSessionDataDateSeries(WEBSITE_ID, 'signedUpAt', base({ timezone })),
    );
    add(`getEventDataPivot/${timezone}`, () =>
      sql.getEventDataPivot(WEBSITE_ID, 'download', base({ timezone, pageSize: 100 }) as any),
    );
    add(`getSessionDataPivot/${timezone}`, () =>
      sql.getSessionDataPivot(WEBSITE_ID, 'company', base({ timezone, pageSize: 100 }) as any),
    );
  }

  add('getEventDataNumericStats', () =>
    sql.getEventDataNumericStats(WEBSITE_ID, 'signup', 'seats', base()),
  );
  add('getSessionDataNumericStats', () =>
    sql.getSessionDataNumericStats(WEBSITE_ID, 'employees', base()),
  );
  add('getSessionDataActivityStats', () =>
    sql.getSessionDataActivityStats(WEBSITE_ID, 'company', base()),
  );

  PROPERTY_FILTERS.forEach((filter, i) => {
    add(`eventPropertyFilter/${i}/${filter.propertyName}/${filter.operator}`, () =>
      sql.getEventDataPivot(WEBSITE_ID, 'signup', base({ pageSize: 100 }) as any, [filter] as any),
    );
    add(`eventPropertyFilter/stats/${i}`, () =>
      sql.getWebsiteStats(WEBSITE_ID, base({ eventPropertyFilters: [filter] })),
    );
  });

  add('getSessionDataProperties', () => sql.getSessionDataProperties(WEBSITE_ID, base()));
  add('getSessionDataProperties/filtered', () =>
    sql.getSessionDataProperties(WEBSITE_ID, base(), [
      {
        propertyName: 'paying',
        dataType: DATA_TYPE.boolean,
        operator: OPERATORS.equals,
        value: 'true',
      },
    ] as any),
  );
  add('getSessionDataPropertySeries', () =>
    sql.getSessionDataPropertySeries(WEBSITE_ID, 'company', base()),
  );
  for (const [propertyName, dataType] of [
    ['company', DATA_TYPE.string],
    ['employees', DATA_TYPE.number],
    ['roles', DATA_TYPE.array],
    ['signedUpAt', DATA_TYPE.date],
  ] as const) {
    add(`getSessionDataValues/${propertyName}`, () =>
      sql.getSessionDataValues(WEBSITE_ID, base({ propertyName, dataType })),
    );
  }

  // Reports
  add('getFunnel', () =>
    sql.getFunnel(
      WEBSITE_ID,
      {
        startDate,
        endDate,
        window: 60,
        steps: [
          { type: 'path', value: '/' },
          { type: 'path', value: '/pricing' },
          { type: 'event', value: 'signup' },
        ],
      },
      base(),
    ),
  );
  add('getFunnel/wildcard-filters', () =>
    sql.getFunnel(
      WEBSITE_ID,
      {
        startDate,
        endDate,
        window: 600,
        steps: [
          { type: 'path', value: '/blog*' },
          {
            type: 'event',
            value: 'signup',
            filters: [{ property: 'plan', operator: OPERATORS.contains, value: 'PR' }],
          },
        ],
      },
      base(),
    ),
  );
  add(
    'getJourney',
    () => sql.getJourney(WEBSITE_ID, { startDate, endDate, steps: 4 }, base()),
    false,
    'count',
  );
  add(
    'getJourney/start-end',
    () =>
      sql.getJourney(
        WEBSITE_ID,
        { startDate, endDate, steps: 5, startStep: '/', endStep: '/checkout' },
        base(),
      ),
    false,
    'count',
  );
  for (const [type, value] of [
    ['path', '/pricing'],
    ['event', 'purchase'],
  ]) {
    add(`getGoal/${type}`, () => getGoal(WEBSITE_ID, { startDate, endDate, type, value }, base()));
    for (const model of ['first-click', 'last-click']) {
      add(`getAttribution/${type}/${model}`, () =>
        getAttribution(WEBSITE_ID, { startDate, endDate, model, type, step: value }, base()),
      );
    }
  }
  for (const column of ['utm_source', 'utm_medium', 'utm_campaign']) {
    add(`getUTM/${column}`, () => sql.getUTM(WEBSITE_ID, { column, startDate, endDate }, base()));
  }

  for (const currency of ['USD', 'EUR']) {
    const parameters = { startDate, endDate, unit: 'day', timezone: 'UTC', currency };
    add(`getRevenueStats/${currency}`, () => getRevenueStats(WEBSITE_ID, parameters, base()));
    for (const type of ['country', 'region', 'referrer', 'channel'] as const) {
      add(`getRevenueMetrics/${currency}/${type}`, () =>
        getRevenueMetrics(WEBSITE_ID, parameters, base(), type),
      );
    }
    add(`getRevenueSessions/${currency}`, () =>
      getRevenueSessions(WEBSITE_ID, currency, base({ pageSize: 100 }) as any),
    );
  }

  for (const metric of ['lcp', 'inp', 'cls', 'fcp', 'ttfb']) {
    const parameters = { startDate, endDate, unit: 'day', timezone: 'UTC', metric };
    add(`getPerformanceStats/${metric}`, () => getPerformanceStats(WEBSITE_ID, parameters, base()));
    add(`getPerformanceMetrics/${metric}`, () =>
      getPerformanceMetrics(WEBSITE_ID, parameters, base(), 'url_path'),
    );
    add(`getPerformanceMetrics/${metric}/browser`, () =>
      getPerformanceMetrics(WEBSITE_ID, parameters, base(), 'browser', 3),
    );
  }

  // Replays and heatmaps
  add('getSessionReplays', () => sql.getSessionReplays(WEBSITE_ID, base({ pageSize: 100 }) as any));
  add('getSessionReplays/min-duration', () =>
    sql.getSessionReplays(WEBSITE_ID, base({ pageSize: 100, minDuration: 60 }) as any),
  );
  add('getSessionReplays/search', () =>
    sql.getSessionReplays(WEBSITE_ID, base({ pageSize: 100, search: 'CHROME' }) as any),
  );
  add('getReplayChunks', () => sql.getReplayChunks(WEBSITE_ID, firstReplay.visit_id));

  for (const mode of ['click', 'scroll'] as const) {
    add(`getHeatmap/${mode}`, () =>
      sql.getHeatmap(WEBSITE_ID, { startDate, endDate, mode, urlPath: '/pricing' } as any),
    );
    add(`getHeatmap/${mode}/pages`, () =>
      sql.getHeatmap(WEBSITE_ID, { startDate, endDate, mode } as any),
    );
  }

  // Realtime (relative to the current time)
  add('getActiveVisitors', () => sql.getActiveVisitors(WEBSITE_ID), true);
  add(
    'getRealtimeData',
    () => sql.getRealtimeData(WEBSITE_ID, { startDate: new Date(Date.now() - 30 * 60_000) } as any),
    true,
  );

  return cases;
}
