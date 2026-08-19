const INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 120 * 1000;

const globalForScheduler = globalThis as unknown as {
  __damPurgeSchedulerStarted?: boolean;
};

/**
 * Daily DAM trash / rejected / incomplete-batch cleanup. Same in-process pattern as RAG sync.
 */
export function startDamPurgeScheduler() {
  if (globalForScheduler.__damPurgeSchedulerStarted) return;
  globalForScheduler.__damPurgeSchedulerStarted = true;

  let running = false;

  const tick = async () => {
    if (running) {
      console.warn("[dam-purge] skip scheduled tick — previous run still active");
      return;
    }
    running = true;
    try {
      const { purgeExpiredDamAssets } = await import("@/lib/dam/trash");
      const summary = await purgeExpiredDamAssets();
      console.log(
        `[dam-purge] tick: archived=${summary.archived} rejected=${summary.rejected} incomplete=${summary.incomplete} errors=${summary.errors}`,
      );
    } catch (err) {
      console.error("[dam-purge] scheduled run failed", err);
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
    `[dam-purge] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 3_600_000}h)`,
  );
}
