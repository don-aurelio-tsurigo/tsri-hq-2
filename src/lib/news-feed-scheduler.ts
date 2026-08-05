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
    try {
      const { runNewsFeedFetchForAllOrgs } = await import("@/lib/news-feed");
      const summary = await runNewsFeedFetchForAllOrgs();
      console.log(
        `[news-feed] scheduled fetch: orgs=${summary.orgs} inserted=${summary.inserted} fetched=${summary.fetched}`,
      );
    } catch (err) {
      console.error("[news-feed] scheduled fetch failed", err);
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
