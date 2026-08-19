const INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 150 * 1000;

const globalForScheduler = globalThis as unknown as {
  __carouselPurgeSchedulerStarted?: boolean;
};

/**
 * Daily cleanup of carousel posts unused for 30 days (updatedAt).
 */
export function startCarouselPurgeScheduler() {
  if (globalForScheduler.__carouselPurgeSchedulerStarted) return;
  globalForScheduler.__carouselPurgeSchedulerStarted = true;

  let running = false;

  const tick = async () => {
    if (running) {
      console.warn(
        "[carousel-purge] skip scheduled tick — previous run still active",
      );
      return;
    }
    running = true;
    try {
      const { purgeExpiredCarouselPosts } = await import(
        "@/lib/carousel/purge"
      );
      const summary = await purgeExpiredCarouselPosts();
      console.log(`[carousel-purge] tick: deleted=${summary.deleted}`);
    } catch (err) {
      console.error("[carousel-purge] scheduled run failed", err);
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
    `[carousel-purge] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 3_600_000}h)`,
  );
}
