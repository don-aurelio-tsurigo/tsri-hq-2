import sharp from "sharp";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { renderPublishedMaster } from "@/lib/dam/apply-edits";
import { buildArchiveKey, derivativeKey, replaceKeyExtension } from "@/lib/dam/filename";
import { prisma } from "@/lib/db";
import { getObjectBuffer, putObject } from "@/lib/r2";

const CONCURRENCY = 2;

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

export type PublishItem = {
  assetId: string;
  altText: string;
};

export type PublishResult = {
  publishedIds: string[];
  errors: { assetId: string; error: string }[];
};

async function publishOne(
  userId: string,
  item: PublishItem,
): Promise<{ error?: string }> {
  const altText = item.altText.trim();
  if (!altText) return { error: "Alt-Text fehlt." };

  const asset = await prisma.asset.findFirst({
    where: {
      id: item.assetId,
      uploadedBy: userId,
      status: "staging",
    },
    select: {
      id: true,
      r2Key: true,
      fileName: true,
      editParams: true,
    },
  });
  if (!asset) return { error: "Bild nicht gefunden." };
  if (!asset.r2Key.startsWith("staging/")) {
    return { error: "Nur Staging-Originale können publiziert werden." };
  }

  const original = await getObjectBuffer(asset.r2Key);
  if (!looksLikeImageBytes(original)) {
    return { error: "Datei ist kein Bild." };
  }

  const published = await renderPublishedMaster(original, asset.editParams);
  const archiveKey = buildArchiveKey({
    userId,
    assetId: asset.id,
    ext: "jpg",
  });
  const [thumb, web] = await Promise.all([
    sharp(published.buffer)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer(),
    sharp(published.buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  ]);

  await Promise.all([
    putObject(archiveKey, published.buffer, "image/jpeg"),
    putObject(derivativeKey(archiveKey, "thumb"), thumb, "image/webp"),
    putObject(derivativeKey(archiveKey, "web"), web, "image/webp"),
  ]);

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      r2Key: archiveKey,
      fileName: replaceKeyExtension(asset.fileName, "jpg"),
      altText,
      status: "published",
      publishedAt: new Date(),
      width: published.width ?? undefined,
      height: published.height ?? undefined,
    },
  });
  return {};
}

export async function publishDamAssets(
  userId: string,
  items: PublishItem[],
): Promise<PublishResult> {
  const publishedIds: string[] = [];
  const errors: { assetId: string; error: string }[] = [];
  await mapPool(items, CONCURRENCY, async (item) => {
    try {
      const result = await publishOne(userId, item);
      if (result.error) errors.push({ assetId: item.assetId, error: result.error });
      else publishedIds.push(item.assetId);
    } catch (error) {
      console.error(`[dam] publish failed for ${item.assetId}`, error);
      errors.push({ assetId: item.assetId, error: "Publizieren fehlgeschlagen." });
    }
  });
  return { publishedIds, errors };
}
