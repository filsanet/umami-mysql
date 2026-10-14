import { ADMIN_USER_ID, buildDataset, WEBSITE_2_ID, WEBSITE_ID } from './dataset';

/**
 * Writes the dataset through umami's own write paths (createSession, saveEvent,
 * saveSessionData, ...) so the MySQL translations of those inserts are covered too.
 */
export async function ingest(now: Date) {
  const { default: prisma } = await import('@/lib/prisma');
  const {
    createSession,
    saveEvent,
    saveHeatmapEvents,
    saveRecording,
    saveSessionData,
    saveSessionLink,
  } = await import('@/queries/sql');

  for (const [id, name] of [
    [WEBSITE_ID, 'Parity Site'],
    [WEBSITE_2_ID, 'parity site two'],
  ]) {
    await prisma.client.website.create({
      data: {
        id,
        name,
        domain: 'example.test',
        userId: ADMIN_USER_ID,
        createdBy: ADMIN_USER_ID,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
    });
  }

  const { sessions } = buildDataset(now);
  let events = 0;

  for (const session of sessions) {
    const { visits, sessionData, ...data } = session;

    await createSession({
      id: data.id,
      websiteId: data.websiteId,
      browser: data.browser,
      os: data.os,
      device: data.device,
      screen: data.screen,
      language: data.language,
      country: data.country,
      region: data.region,
      city: data.city,
      distinctId: data.distinctId,
      createdAt: data.createdAt,
    } as any);

    if (sessionData) {
      await saveSessionData({
        websiteId: data.websiteId,
        sessionId: data.id,
        sessionData: sessionData as any,
        distinctId: data.distinctId ?? undefined,
        createdAt: data.createdAt,
      });
    }

    if (data.distinctId) {
      await saveSessionLink({
        websiteId: data.websiteId,
        sessionId: data.id,
        distinctId: data.distinctId,
        createdAt: data.createdAt,
      });
    }

    for (const visit of visits) {
      for (const event of visit.events) {
        await saveEvent({
          ...event,
          urlQuery: event.urlQuery ?? undefined,
          websiteId: data.websiteId,
          sessionId: data.id,
          visitId: visit.id,
        } as any);
        events++;
      }

      if (visit.replay) {
        await saveRecording({
          websiteId: data.websiteId,
          sessionId: data.id,
          visitId: visit.id,
          chunkIndex: 0,
          events: [{ type: 4, timestamp: visit.replay.startedAt.getTime() }],
          eventCount: visit.replay.eventCount,
          startedAt: visit.replay.startedAt,
          endedAt: visit.replay.endedAt,
        });
      }

      if (visit.heatmap.length) {
        await saveHeatmapEvents(
          visit.heatmap.map(h => ({
            ...h,
            websiteId: data.websiteId,
            sessionId: data.id,
            visitId: visit.id,
          })),
        );
      }
    }
  }

  return { sessions: sessions.length, events };
}
