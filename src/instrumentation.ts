export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNewsFeedScheduler } = await import(
      "./lib/news-feed-scheduler"
    );
    const { startSlackCookingScheduler } = await import(
      "./lib/notifications/slack-scheduler"
    );
    const { startRagSyncScheduler } = await import("./lib/rag/sync-scheduler");
    const { startDamPurgeScheduler } = await import("./lib/dam/purge-scheduler");
    startNewsFeedScheduler();
    startSlackCookingScheduler();
    startRagSyncScheduler();
    startDamPurgeScheduler();
  }
}
