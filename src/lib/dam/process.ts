import sharp from "sharp";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { autotagImage } from "@/lib/dam/autotag";
import { damDebug, damMem } from "@/lib/dam/debug-mem";
import { extractExif } from "@/lib/dam/exif";
import { derivativeKey, replaceKeyExtension } from "@/lib/dam/filename";
import { decodeHeicIfNeeded } from "@/lib/dam/heic";
import { createMasterImage } from "@/lib/dam/master";
import { prisma } from "@/lib/db";
import { deleteObject, getObjectBuffer, putObject } from "@/lib/r2";

const CONCURRENCY = 1;
let processInFlight = 0;

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
  processInFlight += 1;
  try {
    await processOneInner(assetId);
  } finally {
    processInFlight -= 1;
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
      // #region agent log
      damDebug("C", "process.ts:derivatives", "master + thumb/web built", {
        assetId: asset.id,
        inFlight: processInFlight,
        origMb: Math.round((original.length / 1048576) * 10) / 10,
        masterMb: Math.round((master.buffer.length / 1048576) * 10) / 10,
        thumbMb: Math.round((thumb.length / 1048576) * 10) / 10,
        webMb: Math.round((web.length / 1048576) * 10) / 10,
        width: master.width,
        height: master.height,
        mem: damMem(),
      });
      // #endregion

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
      altText: tags.altText,
      keywords: mergedKeywords,
      status: "staging",
    },
  });
  // #region agent log
  damDebug("A", "process.ts:done", "asset processed", {
    assetId: asset.id,
    inFlight: processInFlight,
    skippedMaster: Boolean(asset.width),
    mem: damMem(),
  });
  // #endregion
}

export async function processDamAssets(assetIds: string[]): Promise<void> {
  // #region agent log
  damDebug("A", "process.ts:batch", "processDamAssets start", {
    count: assetIds.length,
    concurrency: CONCURRENCY,
    mem: damMem(),
  });
  // #endregion
  await mapPool(assetIds, CONCURRENCY, async (id) => {
    try {
      await processOne(id);
    } catch (error) {
      console.error(`[dam] processing failed for ${id}`, error);
    }
  });
}
