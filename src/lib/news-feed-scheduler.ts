const INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;

const globalForScheduler = globalThis as unknown as {
  __newsFeedSchedulerStarted?: boolean;
};

/**
 * Starts an in-process timer that refreshes the newsfeed for every org.
 * Only meaningful while the Node server process stays up (dev / next start).
 */
export function startNewsFeedScheduler() {
  if (globalForScheduler.__newsFeedSchedulerStarted) return;
  globalForScheduler.__newsFeedSchedulerStarted = true;

  let running = false;

  const tick = async () => {
    if (running) {
      console.warn("[news-feed] skip scheduled tick — previous run still active");
      return;
    }
    running = true;
    const t0 = Date.now();
    const memSnap = () => {
      const m = process.memoryUsage();
      return {
        rssMb: Math.round(m.rss / 1048576),
        heapMb: Math.round(m.heapUsed / 1048576),
      };
    };
    // #region agent log
    fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "53d2ad",
      },
      body: JSON.stringify({
        sessionId: "53d2ad",
        hypothesisId: "A",
        location: "news-feed-scheduler.ts:tick:start",
        message: "news-feed tick start",
        data: { mem: memSnap() },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const { runNewsFeedFetchForAllOrgs } = await import("@/lib/news-feed");
      const summary = await runNewsFeedFetchForAllOrgs();
      console.log(
        `[news-feed] scheduled fetch: orgs=${summary.orgs} inserted=${summary.inserted} fetched=${summary.fetched} missing=${summary.missing} enriched=${summary.enriched} rssMb=${memSnap().rssMb} heapMb=${memSnap().heapMb}`,
      );
      // #region agent log
      fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "53d2ad",
        },
        body: JSON.stringify({
          sessionId: "53d2ad",
          hypothesisId: "A",
          location: "news-feed-scheduler.ts:tick:end",
          message: "news-feed tick end",
          runId: "post-fix",
          data: {
            ms: Date.now() - t0,
            orgs: summary.orgs,
            inserted: summary.inserted,
            fetched: summary.fetched,
            missing: summary.missing,
            enriched: summary.enriched,
            results: summary.results,
            mem: memSnap(),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (err) {
      console.error("[news-feed] scheduled fetch failed", err);
      // #region agent log
      fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "53d2ad",
        },
        body: JSON.stringify({
          sessionId: "53d2ad",
          hypothesisId: "B",
          location: "news-feed-scheduler.ts:tick:error",
          message: "news-feed tick failed",
          data: {
            ms: Date.now() - t0,
            err: err instanceof Error ? err.message.slice(0, 500) : String(err),
            mem: memSnap(),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(
    `[news-feed] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 60000} min)`,
  );
}
