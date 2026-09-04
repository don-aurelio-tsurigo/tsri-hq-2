const INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_DELAY_MS = 45 * 1000;

const globalForScheduler = globalThis as unknown as {
  __slackCookingSchedulerStarted?: boolean;
};

/**
 * Starts an in-process timer for Slack Kochplan and feedback digests.
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
    try {
      const { runSlackCookingNotificationsForAllOrgs } = await import(
        "@/lib/notifications/cooking-slack"
      );
      const cooking = await runSlackCookingNotificationsForAllOrgs();
      if (
        cooking.weeklySent > 0 ||
        cooking.monthlySent > 0 ||
        cooking.errors > 0
      ) {
        console.log(
          `[slack-cooking] tick: orgs=${cooking.orgs} weekly=${cooking.weeklySent} monthly=${cooking.monthlySent} skipped=${cooking.skipped} errors=${cooking.errors}`,
        );
      }

      const { runSlackFeedbackDigestForAllOrgs } = await import(
        "@/lib/notifications/feedback-slack"
      );
      const feedback = await runSlackFeedbackDigestForAllOrgs();
      if (feedback.sent > 0 || feedback.errors > 0) {
        console.log(
          `[slack-feedback] tick: orgs=${feedback.orgs} sent=${feedback.sent} skipped=${feedback.skipped} errors=${feedback.errors}`,
        );
      }
    } catch (err) {
      console.error("[slack-cooking] scheduled run failed", err);
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
