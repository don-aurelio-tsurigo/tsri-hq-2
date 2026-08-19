import sharp from "sharp";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { autotagImage } from "@/lib/dam/autotag";
import { extractExif } from "@/lib/dam/exif";
import { derivativeKey, replaceKeyExtension } from "@/lib/dam/filename";
import { decodeHeicIfNeeded } from "@/lib/dam/heic";
import { createMasterImage } from "@/lib/dam/master";
import { beginDamAsset, endDamAsset } from "@/lib/dam/process-queue";
import { prisma } from "@/lib/db";
import { deleteObject, getObjectBuffer, putObject } from "@/lib/r2";

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

async function jpegForAutotag(buffer: Buffer): Promise<Buffer> {
  const decoded = await decodeHeicIfNeeded(buffer);
  return sharp(decoded)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
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
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      r2Key: true,
      fileName: true,
      uploadedBy: true,
      altText: true,
      keywords: true,
      width: true,
    },
  });
  if (!asset) return;
  if (asset.altText?.trim()) return;

  let r2Key = asset.r2Key;
  let fileName = asset.fileName;
  let width = asset.width;
  let autotagSource: Buffer | undefined;

  if (!width) {
    const original = await getObjectBuffer(asset.r2Key);
    if (!looksLikeImageBytes(original)) {
      console.warn(`[dam] skip non-image bytes for ${asset.id}`);
      return;
    }

    const exif = await extractExif(original);
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

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        r2Key,
        fileName,
        takenAt: exif.takenAt,
        width,
        height,
        exif: exif.json ?? undefined,
        status: "staging",
      },
    });
  }

  const source = autotagSource ?? (await getObjectBuffer(r2Key));
  const jpeg = await jpegForAutotag(source);
  const tags = await autotagImage(asset.uploadedBy, jpeg);
  const mergedKeywords = [
    ...new Set(
      [...asset.keywords, ...tags.keywords]
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ].slice(0, 24);

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      // Journalist notes stay as uploaded — autotag only writes altText + keywords.
      altText: tags.altText,
      keywords: mergedKeywords,
      status: "staging",
    },
  });
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
