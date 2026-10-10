import { faceRecognitionEnabled, faceSettings } from "@/lib/dam/face-rekognition";
import { prisma } from "@/lib/db";

const INTERVAL_MS = 30 * 1000;
const INITIAL_DELAY_MS = 60 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
/** Failed scans get another try after this (transient AWS errors). */
const RETRY_FAILED_AFTER_MS = 6 * 60 * 60 * 1000;
const RETRY_FAILED_BATCH = 20;
const PROGRESS_LOG_EVERY = 50;
/**
 * Upload processing (process.ts) sets `width`; its queue is in-memory and lost on
 * deploys. After this grace period an asset is scanned even without width.
 */
const PROCESSING_GRACE_MINUTES = 15;
/** Stay well below Rekognition's 5 TPS default in eu-central-1. */
const PAUSE_BETWEEN_ASSETS_MS = 400;

const globalForFaceScheduler = globalThis as unknown as {
  __damFaceSchedulerStarted?: boolean;
  __damFaceRunning?: boolean;
  __damFaceKickTimer?: ReturnType<typeof setTimeout> | null;
};

export type FaceRunSummary = { done: number; skipped: number; failed: number; faces: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Processing rows left behind by a restart/deploy go back to the queue. */
async function resetStaleProcessing(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  await prisma.$executeRaw`
    UPDATE "asset" SET "faceStatus" = 'pending'::"FaceScanStatus"
    WHERE "faceStatus" = 'processing'::"FaceScanStatus"
      AND ("faceScannedAt" IS NULL OR "faceScannedAt" < ${cutoff})
  `;
}

/** Puts a few old failures back into the queue; permanent failures cost one call per 6 h. */
async function requeueOldFailures(): Promise<void> {
  const cutoff = new Date(Date.now() - RETRY_FAILED_AFTER_MS);
  await prisma.$executeRaw`
    UPDATE "asset" SET "faceStatus" = 'pending'::"FaceScanStatus"
    WHERE "id" IN (
      SELECT "id" FROM "asset"
      WHERE "faceStatus" = 'failed'::"FaceScanStatus"
        AND "status" IN ('staging'::"AssetStatus", 'published'::"AssetStatus")
        AND "deletedAt" IS NULL
        AND ("faceScannedAt" IS NULL OR "faceScannedAt" < ${cutoff})
      LIMIT ${RETRY_FAILED_BATCH}
    )
  `;
}

/**
 * Claims the next pending assets in staging or the archive, newest first so fresh
 * uploads don't wait behind a backfill. Waits for upload processing (width set),
 * but not forever — see PROCESSING_GRACE_MINUTES.
 */
async function claimPending(limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "asset" SET "faceStatus" = 'processing'::"FaceScanStatus", "faceScannedAt" = NOW()
    WHERE "id" IN (
      SELECT "id" FROM "asset"
      WHERE "faceStatus" = 'pending'::"FaceScanStatus"
        AND "status" IN ('staging'::"AssetStatus", 'published'::"AssetStatus")
        AND "deletedAt" IS NULL
        AND (
          "width" IS NOT NULL
          OR "createdAt" < NOW() - make_interval(mins => ${PROCESSING_GRACE_MINUTES})
        )
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `;
  return rows.map((row) => row.id);
}

/** Drains the queue (or up to `maxAssets`). Shared by the scheduler and the CLI. */
export async function runDamFaceScan(maxAssets = Infinity): Promise<FaceRunSummary> {
  const { faceScanStage, scanAssetFaces, setFaceStatus } = await import("@/lib/dam/face-scan");
  const summary: FaceRunSummary = { done: 0, skipped: 0, failed: 0, faces: 0 };
  await resetStaleProcessing();
  await requeueOldFailures();

  let processed = 0;
  while (processed < maxAssets) {
    const ids = await claimPending(Math.min(faceSettings().batchSize, maxAssets - processed));
    if (ids.length === 0) break;
    for (const id of ids) {
      processed += 1;
      try {
        const result = await scanAssetFaces(id);
        if (result.status === "done") summary.done += 1;
        else summary.skipped += 1;
        summary.faces += result.faces;
      } catch (error) {
        summary.failed += 1;
        const stage = faceScanStage(error) ?? "unknown";
        const name = error instanceof Error ? error.name : "Error";
        console.error(`[dam-face] scan failed for ${id} at ${stage}: ${name}`, error);
        await setFaceStatus([id], "failed").catch(() => undefined);
      }
      if (processed % PROGRESS_LOG_EVERY === 0) {
        console.log(
          `[dam-face] progress: ${processed} scanned (done=${summary.done} skipped=${summary.skipped} failed=${summary.failed} faces=${summary.faces})`,
        );
      }
      await sleep(PAUSE_BETWEEN_ASSETS_MS);
    }
  }
  return summary;
}

async function tick(): Promise<void> {
  const g = globalForFaceScheduler;
  if (g.__damFaceRunning) return;
  g.__damFaceRunning = true;
  try {
    const summary = await runDamFaceScan();
    if (summary.done + summary.skipped + summary.failed > 0) {
      console.log(
        `[dam-face] tick: done=${summary.done} skipped=${summary.skipped} failed=${summary.failed} faces=${summary.faces}`,
      );
    }
  } catch (error) {
    console.error("[dam-face] scheduled run failed", error);
  } finally {
    g.__damFaceRunning = false;
  }
}

/** Run soon after new uploads were processed, instead of waiting for the interval. */
export function kickDamFaceScan(): void {
  const g = globalForFaceScheduler;
  if (!g.__damFaceSchedulerStarted || g.__damFaceKickTimer) return;
  g.__damFaceKickTimer = setTimeout(() => {
    g.__damFaceKickTimer = null;
    void tick();
  }, 2000);
}

export function startDamFaceScheduler(): void {
  const g = globalForFaceScheduler;
  if (g.__damFaceSchedulerStarted) return;
  if (!faceRecognitionEnabled()) {
    console.log("[dam-face] scheduler off (FACE_RECOGNITION_ENABLED / REKOGNITION_* not set)");
    return;
  }
  g.__damFaceSchedulerStarted = true;

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(
    `[dam-face] scheduler started (first run in ${INITIAL_DELAY_MS / 1000}s, then every ${INTERVAL_MS / 1000}s)`,
  );
}
