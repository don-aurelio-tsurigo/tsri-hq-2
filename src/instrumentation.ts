export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // libvips settings are process-wide. Set them before any scheduler or
    // request touches sharp: the default 50 MB op cache plus one thread per
    // CPU pushes the 512 MB instance over its limit (face scan, previews).
    const { default: sharp } = await import("sharp");
    sharp.cache(false);
    sharp.concurrency(1);

    const { startNewsFeedScheduler } = await import(
      "./lib/news-feed-scheduler"
    );
    const { startSlackCookingScheduler } = await import(
      "./lib/notifications/slack-scheduler"
    );
    const { startRagSyncScheduler } = await import("./lib/rag/sync-scheduler");
    const { startDamPurgeScheduler } = await import("./lib/dam/purge-scheduler");
    const { startDamFaceScheduler } = await import("./lib/dam/face-scheduler");
    const { startCarouselPurgeScheduler } = await import(
      "./lib/carousel/purge-scheduler"
    );
    startNewsFeedScheduler();
    startSlackCookingScheduler();
    startRagSyncScheduler();
    startDamPurgeScheduler();
    startDamFaceScheduler();
    startCarouselPurgeScheduler();
  }
}
