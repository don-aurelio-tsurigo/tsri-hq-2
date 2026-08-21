const globalForQueue = globalThis as unknown as {
  __damProcessQueue?: string[];
  __damProcessTimer?: ReturnType<typeof setTimeout> | null;
  __damProcessRunning?: boolean;
  __damProcessingIds?: Set<string>;
};

function queueState() {
  const g = globalForQueue;
  g.__damProcessQueue = g.__damProcessQueue ?? [];
  g.__damProcessingIds = g.__damProcessingIds ?? new Set();
  return g;
}

export function beginDamAsset(assetId: string): boolean {
  const g = queueState();
  if (g.__damProcessingIds!.has(assetId)) return false;
  g.__damProcessingIds!.add(assetId);
  return true;
}

export function endDamAsset(assetId: string): void {
  queueState().__damProcessingIds!.delete(assetId);
}

/**
 * Run DAM EXIF/thumb/autotag work off the HTTP request.
 * Next `after()` is aborted when the user navigates away (e.g. to Meine Uploads).
 */
export function enqueueDamProcessing(assetIds: string[]): void {
  const g = queueState();
  for (const id of assetIds) {
    if (!id || g.__damProcessQueue!.includes(id) || g.__damProcessingIds!.has(id)) {
      continue;
    }
    g.__damProcessQueue!.push(id);
  }
  if (g.__damProcessRunning || g.__damProcessTimer) return;
  g.__damProcessTimer = setTimeout(() => {
    g.__damProcessTimer = null;
    void drainDamProcessing();
  }, 0);
}

async function drainDamProcessing(): Promise<void> {
  const g = queueState();
  if (g.__damProcessRunning) return;
  g.__damProcessRunning = true;
  try {
    while ((g.__damProcessQueue?.length ?? 0) > 0) {
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const id of g.__damProcessQueue ?? []) {
        if (!id || seen.has(id) || g.__damProcessingIds!.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
      g.__damProcessQueue = [];
      if (ids.length === 0) break;
      const { processDamAssets } = await import("@/lib/dam/process");
      await processDamAssets(ids);
    }
  } catch (error) {
    console.error("[dam] background process failed", error);
  } finally {
    g.__damProcessRunning = false;
    if ((g.__damProcessQueue?.length ?? 0) > 0) {
      enqueueDamProcessing([]);
    }
  }
}
