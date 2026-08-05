export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNewsFeedScheduler } = await import(
      "./lib/news-feed-scheduler"
    );
    startNewsFeedScheduler();
  }
}
