export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // #region agent log
    const memSnap = () => {
      const m = process.memoryUsage();
      return {
        rssMb: Math.round(m.rss / 1048576),
        heapMb: Math.round(m.heapUsed / 1048576),
        heapTotalMb: Math.round(m.heapTotal / 1048576),
        externalMb: Math.round(m.external / 1048576),
      };
    };
    const debugLog = (
      hypothesisId: string,
      location: string,
      message: string,
      data: Record<string, unknown>,
    ) => {
      const payload = {
        sessionId: "53d2ad",
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      };
      console.log(`[debug-53d2ad] ${JSON.stringify(payload)}`);
      fetch("http://127.0.0.1:7763/ingest/1fb8c4af-59a8-417d-8bad-c18c3a190274", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "53d2ad",
        },
        body: JSON.stringify(payload),
      }).catch(() => {});
    };
    debugLog("A", "instrumentation.ts:register", "nodejs register", {
      pid: process.pid,
      mem: memSnap(),
      node: process.version,
    });
    process.on("SIGTERM", () => {
      debugLog("D", "instrumentation.ts:SIGTERM", "received SIGTERM", {
        pid: process.pid,
        mem: memSnap(),
        uptimeS: Math.round(process.uptime()),
      });
    });
    process.on("SIGINT", () => {
      debugLog("D", "instrumentation.ts:SIGINT", "received SIGINT", {
        pid: process.pid,
        mem: memSnap(),
        uptimeS: Math.round(process.uptime()),
      });
    });
    process.on("uncaughtException", (err) => {
      debugLog("B", "instrumentation.ts:uncaughtException", "uncaughtException", {
        name: err?.name,
        message: String(err?.message ?? err).slice(0, 500),
        mem: memSnap(),
      });
    });
    process.on("unhandledRejection", (reason) => {
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? "unknown");
      debugLog("B", "instrumentation.ts:unhandledRejection", "unhandledRejection", {
        message: message.slice(0, 500),
        mem: memSnap(),
      });
    });
    process.on("beforeExit", (code) => {
      debugLog("D", "instrumentation.ts:beforeExit", "beforeExit", {
        code,
        mem: memSnap(),
        uptimeS: Math.round(process.uptime()),
      });
    });
    process.on("exit", (code) => {
      console.log(
        `[debug-53d2ad] ${JSON.stringify({
          sessionId: "53d2ad",
          hypothesisId: "D",
          location: "instrumentation.ts:exit",
          message: "exit",
          data: { code, mem: memSnap(), uptimeS: Math.round(process.uptime()) },
          timestamp: Date.now(),
        })}`,
      );
    });
    let polls = 0;
    const poll = setInterval(() => {
      polls += 1;
      debugLog("A", "instrumentation.ts:memPoll", "memory poll", {
        polls,
        uptimeS: Math.round(process.uptime()),
        mem: memSnap(),
      });
      if (polls >= 12) clearInterval(poll);
    }, 15_000);
    // #endregion

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
