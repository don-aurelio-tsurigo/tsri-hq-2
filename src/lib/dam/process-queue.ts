const globalForQueue = globalThis as unknown as {
  __damProcessQueue?: string[];
  __damProcessTimer?: ReturnType<typeof setTimeout> | null;
};

/**
 * Run DAM EXIF/thumb/autotag work off the HTTP request.
 * Next `after()` is aborted when the user navigates away (e.g. to Meine Fotos).
 */
export function enqueueDamProcessing(assetIds: string[]): void {
  const g = globalForQueue;
  g.__damProcessQueue = g.__damProcessQueue ?? [];
  for (const id of assetIds) {
    if (!id || g.__damProcessQueue.includes(id)) continue;
    g.__damProcessQueue.push(id);
  }
  if (g.__damProcessTimer) return;
  g.__damProcessTimer = setTimeout(() => {
    g.__damProcessTimer = null;
    void drainDamProcessing();
  }, 0);
}

async function drainDamProcessing(): Promise<void> {
  const g = globalForQueue;
  const ids = g.__damProcessQueue ?? [];
  g.__damProcessQueue = [];
  if (ids.length === 0) return;
  try {
    const { damDebug, damMem } = await import("@/lib/dam/debug-mem");
    // #region agent log
    damDebug("A", "process-queue.ts:drain:start", "DAM process drain start", {
      count: ids.length,
      mem: damMem(),
    });
    // #endregion
    const { processDamAssets } = await import("@/lib/dam/process");
    await processDamAssets(ids);
    // #region agent log
    damDebug("A", "process-queue.ts:drain:end", "DAM process drain end", {
      count: ids.length,
      queued: g.__damProcessQueue?.length ?? 0,
      mem: damMem(),
    });
    // #endregion
  } catch (error) {
    console.error("[dam] background process failed", error);
  }
  if ((g.__damProcessQueue?.length ?? 0) > 0) {
    enqueueDamProcessing([]);
  }
}
