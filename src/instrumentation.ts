export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNewsFeedScheduler } = await import(
      "./lib/news-feed-scheduler"
    );
    const { startSlackCookingScheduler } = await import(
      "./lib/notifications/slack-scheduler"
    );
    const { startRagSyncScheduler } = await import("./lib/rag/sync-scheduler");
    startNewsFeedScheduler();
    startSlackCookingScheduler();
    startRagSyncScheduler();
  }
}
