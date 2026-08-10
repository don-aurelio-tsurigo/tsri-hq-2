const INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 90 * 1000;

const globalForScheduler = globalThis as unknown as {
  __ragSyncSchedulerStarted?: boolean;
};

/**
 * Starts an in-process daily RAG archive sync (WePublish → embeddings → rag.*).
 * Only meaningful while the Node server process stays up (dev / next start).
 */
export function startRagSyncScheduler() {
  if (globalForScheduler.__ragSyncSchedulerStarted) return;
  globalForScheduler.__ragSyncSchedulerStarted = true;

  let running = false;

  const tick = async () => {
    if (running) {
      console.warn("[rag-sync] skip scheduled tick — previous run still active");
      return;
    }
    running = true;
    try {
      const { runRagSync } = await import("@/lib/rag/sync");
      const summary = await runRagSync();
      if (summary.skipped) {
        console.log(`[rag-sync] skipped: ${summary.reason}`);
        return;
      }
      console.log(
        `[rag-sync] tick: since=${summary.since} fetched=${summary.fetched} upserted=${summary.upserted} chunks=${summary.chunks} empty=${summary.skippedEmpty} errors=${summary.errors} cursor=${summary.cursorAdvancedTo ?? "—"}`,
      );
    } catch (err) {
      console.error("[rag-sync] scheduled run failed", err);
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
    `[rag-sync] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 3_600_000}h)`,
  );
}
