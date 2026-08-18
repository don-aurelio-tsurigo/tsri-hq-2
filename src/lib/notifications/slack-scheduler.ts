const INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 45 * 1000;

const globalForScheduler = globalThis as unknown as {
  __slackCookingSchedulerStarted?: boolean;
};

/**
 * Starts an in-process timer for Slack Kochplan digests.
 * Only meaningful while the Node server process stays up (dev / next start).
 */
export function startSlackCookingScheduler() {
  if (globalForScheduler.__slackCookingSchedulerStarted) return;
  globalForScheduler.__slackCookingSchedulerStarted = true;

  let running = false;

  const tick = async () => {
    if (running) {
      console.warn(
        "[slack-cooking] skip scheduled tick — previous run still active",
      );
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
        hypothesisId: "B",
        location: "slack-scheduler.ts:tick:start",
        message: "slack tick start",
        data: { mem: memSnap() },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const { runSlackCookingNotificationsForAllOrgs } = await import(
        "@/lib/notifications/cooking-slack"
      );
      const summary = await runSlackCookingNotificationsForAllOrgs();
      if (
        summary.weeklySent > 0 ||
        summary.monthlySent > 0 ||
        summary.errors > 0
      ) {
        console.log(
          `[slack-cooking] tick: orgs=${summary.orgs} weekly=${summary.weeklySent} monthly=${summary.monthlySent} skipped=${summary.skipped} errors=${summary.errors}`,
        );
      }
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
          location: "slack-scheduler.ts:tick:end",
          message: "slack tick end",
          data: {
            ms: Date.now() - t0,
            summary,
            mem: memSnap(),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (err) {
      console.error("[slack-cooking] scheduled run failed", err);
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
          location: "slack-scheduler.ts:tick:error",
          message: "slack tick failed",
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
    `[slack-cooking] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 60000} min)`,
  );
}
