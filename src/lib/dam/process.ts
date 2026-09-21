import sharp from "sharp";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { backfillAssetExif } from "@/lib/dam/backfill-exif";
import { autotagFromImageBuffer } from "@/lib/dam/autotag";
import { extractExif, resolveTakenAt } from "@/lib/dam/exif";
import { derivativeKey, replaceKeyExtension } from "@/lib/dam/filename";
import { uniqueKeywords } from "@/lib/dam/keywords";
import { createMasterImage } from "@/lib/dam/master";
import { beginDamAsset, endDamAsset } from "@/lib/dam/process-queue";
import { prisma } from "@/lib/db";
import { deleteObject, getObject, putObject } from "@/lib/r2";

const CONCURRENCY = 1;

sharp.cache(false);
sharp.concurrency(1);

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      await fn(next);
    }
  });
  await Promise.all(workers);
}

const stagingSelect = {
  id: true,
  r2Key: true,
  fileName: true,
  uploadedBy: true,
  altText: true,
  keywords: true,
  width: true,
  takenAt: true,
  status: true,
} as const;

function isStagingOriginal(asset: {
  status: string;
  r2Key: string;
}): boolean {
  return asset.status === "staging" && asset.r2Key.startsWith("staging/");
}

async function processOne(assetId: string): Promise<void> {
  if (!beginDamAsset(assetId)) return;
  try {
    await processOneInner(assetId);
  } finally {
    endDamAsset(assetId);
  }
}

async function processOneInner(assetId: string): Promise<void> {
  let asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: stagingSelect,
  });
  if (!asset || !isStagingOriginal(asset)) return;

  if (!asset.takenAt) {
    await backfillAssetExif(assetId);
    asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: stagingSelect,
    });
    if (!asset || !isStagingOriginal(asset)) return;
  }

  let r2Key = asset.r2Key;
  let fileName = asset.fileName;
  let width = asset.width;
  let autotagSource: Buffer | undefined;

  if (!width) {
    const { buffer: original, metadata } = await getObject(asset.r2Key);
    if (!looksLikeImageBytes(original)) {
      console.warn(`[dam] skip non-image bytes for ${asset.id}`);
      return;
    }

    const exif = await extractExif(original);
    const takenAt = resolveTakenAt({
      exifTakenAt: exif.takenAt,
      metadata,
      existing: asset.takenAt,
    });
    let height = exif.height;
    width = exif.width;

    try {
      const master = await createMasterImage(original);
      const nextKey = replaceKeyExtension(asset.r2Key, master.extension);
      const nextName = replaceKeyExtension(asset.fileName, master.extension);

      const thumb = await sharp(master.buffer)
        .resize({ width: 480, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();
      const web = await sharp(master.buffer)
        .resize({ width: 2000, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Publish may have moved the asset while we were processing — abort writes.
      const stillStaging = await prisma.asset.findFirst({
        where: { id: asset.id, status: "staging", r2Key: { startsWith: "staging/" } },
        select: { id: true },
      });
      if (!stillStaging) {
        console.warn(`[dam] skip master write; asset left staging: ${asset.id}`);
        return;
      }

      await Promise.all([
        putObject(nextKey, master.buffer, master.contentType),
        putObject(derivativeKey(nextKey, "thumb"), thumb, "image/webp"),
        putObject(derivativeKey(nextKey, "web"), web, "image/webp"),
      ]);
      if (nextKey !== asset.r2Key) {
        try {
          await deleteObject(asset.r2Key);
        } catch (error) {
          console.warn(`[dam] could not delete original ${asset.r2Key}`, error);
        }
      }
      r2Key = nextKey;
      fileName = nextName;
      width = master.width || width;
      height = master.height || height;
      autotagSource = master.buffer;
    } catch (error) {
      console.warn(`[dam] sharp failed for ${asset.id}`, error);
    }

    // Never force status back to staging — that races with publish and can
    // leave archive/ keys marked as staging («Nur Staging-Originale…»).
    await prisma.asset.updateMany({
      where: { id: asset.id, status: "staging" },
      data: {
        r2Key,
        fileName,
        takenAt,
        width,
        height,
        exif: exif.json ?? undefined,
      },
    });
  }

  const latest = await prisma.asset.findUnique({
    where: { id: asset.id },
    select: { status: true, r2Key: true, altText: true, keywords: true },
  });
  if (!latest || !isStagingOriginal(latest)) return;
  if (latest.altText?.trim() && latest.keywords.length > 0) return;

  try {
    const source = autotagSource ?? (await getObject(r2Key)).buffer;
    const tags = await autotagFromImageBuffer(asset.uploadedBy, source);
    if (!tags.altText && tags.keywords.length === 0) return;

    const mergedKeywords = uniqueKeywords([...latest.keywords, ...tags.keywords]);

    await prisma.asset.updateMany({
      where: { id: asset.id, status: "staging" },
      data: {
        ...(tags.altText ? { altText: tags.altText } : {}),
        ...(mergedKeywords.length > 0 ? { keywords: mergedKeywords } : {}),
      },
    });
  } catch (error) {
    console.error(`[dam] autotag failed for ${asset.id}`, error);
  }
}

export async function processDamAssets(assetIds: string[]): Promise<void> {
  await mapPool(assetIds, CONCURRENCY, async (id) => {
    try {
      await processOne(id);
    } catch (error) {
      console.error(`[dam] processing failed for ${id}`, error);
    }
  });
}
