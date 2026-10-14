import { createRandom, type Random } from './random';

/**
 * Deterministic analytics dataset for the PostgreSQL/MySQL parity suite.
 *
 * The data deliberately covers what tends to differ between databases:
 * mixed-case and unicode values, quotes, NULLs, timezone and DST boundaries,
 * every event-data type, revenue, performance metrics, replays and heatmaps.
 */

export const START = new Date('2024-03-01T00:00:00.000Z');
export const DAYS = 45; // crosses the US (Mar 10) and EU (Mar 31) DST changes
export const END = new Date(START.getTime() + DAYS * 86_400_000 - 1);

export const WEBSITE_ID = '9a000000-0000-4000-8000-000000000001';
export const WEBSITE_2_ID = '9a000000-0000-4000-8000-000000000002';
export const ADMIN_USER_ID = '41e2b680-648e-4b09-bcd7-3e2b10c06264';

export const PAGES = [
  { url: '/', title: 'Home' },
  { url: '/pricing', title: 'Pricing' },
  { url: '/Pricing', title: 'Pricing (old link)' },
  { url: '/about', title: 'About us' },
  { url: '/About', title: 'About Us' },
  { url: '/blog/hello-world', title: 'Hello, "World"' },
  { url: '/blog/café-crème', title: 'Café crème ☕' },
  { url: '/docs/getting-started', title: "Getting started: it's easy" },
  { url: '/docs/api', title: 'API 100% reference' },
  { url: '/signup', title: 'Sign up' },
  { url: '/checkout', title: 'Checkout' },
];

export const QUERIES = [null, null, null, 'ref=nav', 'q=Search%20Term', 'page=2&sort=desc'];

export const REFERRERS = [
  null,
  null,
  { domain: 'www.google.com', path: '/search' },
  { domain: 'google.com', path: '/' },
  { domain: 'bing.com', path: '/search' },
  { domain: 'duckduckgo.com', path: '/' },
  { domain: 'mail.google.com', path: '/mail/u/0' },
  { domain: 'news.ycombinator.com', path: '/item' },
  { domain: 'www.facebook.com', path: '/' },
  { domain: 'm.youtube.com', path: '/watch' },
  { domain: 'www.amazon.com', path: '/dp/B0' },
  { domain: 'partner.example.org', path: '/Links' },
];

export const UTMS = [
  null,
  null,
  null,
  { source: 'newsletter', medium: 'email', campaign: 'Spring Launch' },
  { source: 'google', medium: 'cpc', campaign: 'brand' },
  { source: 'facebook', medium: 'paid-social', campaign: 'retargeting' },
  { source: 'partner', medium: 'affiliate', campaign: 'q1' },
  { source: 'Twitter', medium: 'Organic', campaign: null },
  { source: 'sms-blast', medium: 'sms', campaign: 'promo' },
];

export const BROWSERS = ['chrome', 'firefox', 'safari', 'edge-chromium', 'ios', null];
export const OSES = ['Windows 10', 'Mac OS', 'Linux', 'iOS', 'Android OS', null];
export const DEVICES = ['desktop', 'laptop', 'mobile', 'tablet', null];
export const SCREENS = ['1920x1080', '1440x900', '390x844', '768x1024', null];
export const LANGUAGES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', null];
export const LOCATIONS = [
  { country: 'US', region: 'US-CA', city: 'San Francisco' },
  { country: 'US', region: 'US-NY', city: 'New York' },
  { country: 'GB', region: 'GB-ENG', city: 'London' },
  { country: 'DE', region: 'DE-BE', city: 'Berlin' },
  { country: 'FR', region: 'FR-IDF', city: 'Paris' },
  { country: 'JP', region: 'JP-13', city: 'Tōkyō' },
  { country: null, region: null, city: null },
];

export const EVENT_NAMES = ['signup', 'purchase', 'download', 'Video Play', 'outbound-link'];
export const PLANS = ['free', 'pro', 'Pro', 'enterprise'];
export const CURRENCIES = ['USD', 'EUR'];
export const TAGS = [null, null, 'beta', 'A/B: variant'];
export const DISTINCT_IDS = ['user-1', 'user-2', 'User-3', 'user@example.com', 'user-5'];

export interface DatasetSession {
  id: string;
  websiteId: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  screen: string | null;
  language: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  distinctId: string | null;
  createdAt: Date;
  visits: DatasetVisit[];
  sessionData: Record<string, unknown> | null;
}

export interface DatasetVisit {
  id: string;
  events: DatasetEvent[];
  replay: { startedAt: Date; endedAt: Date; eventCount: number } | null;
  heatmap: DatasetHeatmapEvent[];
}

export interface DatasetEvent {
  eventType: number;
  createdAt: Date;
  urlPath: string;
  urlQuery: string | null;
  pageTitle: string;
  hostname: string;
  referrerDomain: string | null;
  referrerPath: string | null;
  referrerQuery: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  eventName: string | null;
  eventData: Record<string, unknown> | null;
  tag: string | null;
  lcp?: number;
  inp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
}

export interface DatasetHeatmapEvent {
  eventType: number;
  urlPath: string;
  x: number | null;
  y: number | null;
  pageX: number | null;
  pageY: number | null;
  pageW: number | null;
  pageH: number | null;
  viewportW: number | null;
  viewportH: number | null;
  scrollPct: number | null;
  createdAt: Date;
}

const MINUTE = 60_000;

function buildEventData(random: Random, eventName: string, _at: Date) {
  switch (eventName) {
    case 'signup':
      return {
        plan: random.pick(PLANS),
        seats: random.int(1, 50),
        trial: random.chance(0.5),
        ...(random.chance(0.3) && { tags: random.pick([['a'], ['a', 'b'], ['B', 'c'], []]) }),
      };
    case 'purchase':
      return {
        revenue: random.int(100, 50_000) / 100,
        currency: random.pick(CURRENCIES),
        items: random.int(1, 5),
        coupon: random.pick(['SPRING', 'spring', null, "it's-50%"]),
      };
    case 'download':
      return {
        file: random.pick(['report.pdf', 'Report.PDF', 'data.csv']),
        size: random.int(1, 10_000) / 10,
        // dates exercise the date-typed event data paths
        releasedAt: new Date(
          START.getTime() - random.int(1, 40) * 86_400_000 - random.pick([0, 5, 23]) * 3_600_000,
        ).toISOString(),
      };
    case 'Video Play':
      return { duration: random.int(5, 600), quality: random.pick(['720p', '1080p', '4K']) };
    default:
      return null;
  }
}

function buildVisit(
  random: Random,
  sessionStart: Date,
  first: boolean,
): { visit: DatasetVisit; end: Date } {
  const id = random.uuid();
  const events: DatasetEvent[] = [];
  const heatmap: DatasetHeatmapEvent[] = [];
  const referrer = first ? random.pick(REFERRERS) : null;
  const utm = first ? random.pick(UTMS) : null;
  const pageviews = random.chance(0.35) ? 1 : random.int(2, 7);
  let at = new Date(sessionStart);
  const hostname = random.chance(0.9) ? 'example.test' : 'www.example.test';

  for (let i = 0; i < pageviews; i++) {
    const page = random.pick(PAGES);
    const urlQuery = i === 0 && utm ? `utm_source=${utm.source}` : random.pick(QUERIES);

    events.push({
      eventType: 1,
      createdAt: new Date(at),
      urlPath: page.url,
      urlQuery,
      pageTitle: page.title,
      hostname,
      referrerDomain: i === 0 ? (referrer?.domain ?? null) : hostname,
      referrerPath: i === 0 ? (referrer?.path ?? null) : null,
      referrerQuery: null,
      utmSource: i === 0 ? (utm?.source ?? null) : null,
      utmMedium: i === 0 ? (utm?.medium ?? null) : null,
      utmCampaign: i === 0 ? (utm?.campaign ?? null) : null,
      gclid: i === 0 && utm?.medium === 'cpc' ? 'gclid-123' : null,
      eventName: null,
      eventData: null,
      tag: random.pick(TAGS),
    });

    if (random.chance(0.4)) {
      events.push({
        eventType: 5,
        createdAt: new Date(at.getTime() + 1500),
        urlPath: page.url,
        urlQuery: null,
        pageTitle: page.title,
        hostname,
        referrerDomain: null,
        referrerPath: null,
        referrerQuery: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        gclid: null,
        eventName: null,
        eventData: null,
        tag: null,
        lcp: random.int(400, 6000),
        inp: random.int(16, 800),
        cls: random.int(0, 4000) / 10000,
        fcp: random.int(200, 4000),
        ttfb: random.int(20, 1800),
      });
    }

    if (random.chance(0.45)) {
      const eventName = random.pick(EVENT_NAMES);
      const eventAt = new Date(at.getTime() + random.int(2, 40) * 1000);

      events.push({
        eventType: 2,
        createdAt: eventAt,
        urlPath: page.url,
        urlQuery: null,
        pageTitle: page.title,
        hostname,
        referrerDomain: null,
        referrerPath: null,
        referrerQuery: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        gclid: null,
        eventName,
        eventData: buildEventData(random, eventName, eventAt),
        tag: null,
      });
    }

    if (random.chance(0.3)) {
      const viewportW = random.pick([1280, 1440, 390]);
      const viewportH = random.pick([720, 900, 844]);
      const pageH = random.pick([2000, 3200, 5000]);

      heatmap.push({
        eventType: 1,
        urlPath: page.url,
        x: random.int(0, 1000),
        y: random.int(0, 1000),
        pageX: random.int(0, viewportW),
        pageY: random.int(0, pageH),
        pageW: viewportW,
        pageH,
        viewportW,
        viewportH,
        scrollPct: null,
        createdAt: new Date(at.getTime() + 3000),
      });
      heatmap.push({
        eventType: 2,
        urlPath: page.url,
        x: null,
        y: null,
        pageX: null,
        pageY: null,
        pageW: viewportW,
        pageH,
        viewportW,
        viewportH,
        scrollPct: random.int(0, 100),
        createdAt: new Date(at.getTime() + 4000),
      });
    }

    at = new Date(at.getTime() + random.int(5, 600) * 1000);
  }

  const replay = random.chance(0.25)
    ? {
        startedAt: new Date(sessionStart),
        endedAt: new Date(at.getTime() - random.int(0, 4000)),
        eventCount: random.int(1, 40),
      }
    : null;

  return { visit: { id, events, replay, heatmap }, end: at };
}

function buildSession(random: Random, websiteId: string, createdAt: Date): DatasetSession {
  const location = random.pick(LOCATIONS);
  const distinctId = random.chance(0.25) ? random.pick(DISTINCT_IDS) : null;
  const visits: DatasetVisit[] = [];
  let at = createdAt;
  const visitCount = random.chance(0.7) ? 1 : random.int(2, 3);

  for (let i = 0; i < visitCount; i++) {
    const { visit, end } = buildVisit(random, at, i === 0);
    visits.push(visit);
    // next visit hours or days later
    at = new Date(end.getTime() + random.int(60, 60 * 24 * 6) * MINUTE);
  }

  return {
    id: random.uuid(),
    websiteId,
    browser: random.pick(BROWSERS),
    os: random.pick(OSES),
    device: random.pick(DEVICES),
    screen: random.pick(SCREENS),
    language: random.pick(LANGUAGES),
    ...location,
    distinctId,
    createdAt,
    visits,
    sessionData:
      distinctId || random.chance(0.2)
        ? {
            company: random.pick(['Acme', 'acme', 'Globex', 'Initech']),
            employees: random.int(1, 5000),
            paying: random.chance(0.5),
            signedUpAt: new Date(
              createdAt.getTime() - random.int(1, 300) * 86_400_000,
            ).toISOString(),
            ...(random.chance(0.3) && {
              roles: random.pick([['admin'], ['admin', 'dev'], ['Dev']]),
            }),
          }
        : null,
  };
}

export function buildDataset(now = new Date()) {
  const random = createRandom();
  const sessions: DatasetSession[] = [];

  for (let day = 0; day < DAYS; day++) {
    const count = 4 + (day % 7 < 5 ? random.int(4, 10) : random.int(0, 4));

    for (let i = 0; i < count; i++) {
      // bias toward times near local midnights in the test timezones
      const minute = random.chance(0.3)
        ? random.pick([0, 5, 4 * 60 + 55, 5 * 60 + 5, 22 * 60 + 58, 23 * 60 + 59, 9 * 60 + 2])
        : random.int(0, 24 * 60 - 1);
      // unique timestamps keep "latest first" orderings free of ties
      const createdAt = new Date(
        START.getTime() + day * 86_400_000 + minute * MINUTE + random.int(0, 59_999),
      );

      sessions.push(buildSession(random, day % 9 === 4 ? WEBSITE_2_ID : WEBSITE_ID, createdAt));
    }
  }

  // Realtime data: sessions in the last few minutes relative to `now`.
  for (let i = 0; i < 6; i++) {
    sessions.push(
      buildSession(random, WEBSITE_ID, new Date(now.getTime() - (i * 2 + 1) * MINUTE - 500)),
    );
  }

  return { sessions, random };
}
