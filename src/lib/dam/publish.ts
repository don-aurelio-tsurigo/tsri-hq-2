import { looksLikeImageBytes, sniffImageContentType } from "@/lib/dam/accept";
import { writeEditedDerivatives } from "@/lib/dam/derivatives";
import {
  buildArchiveKey,
  fileExtension,
} from "@/lib/dam/filename";
import { r2KeysForAsset } from "@/lib/dam/r2-keys";
import { prisma } from "@/lib/db";
import { deleteObject, getObjectBuffer, putObject } from "@/lib/r2";

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
  notes: string;
  collectionIds: string[];
};

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type PublishResult = {
  publishedIds: string[];
  errors: { assetId: string; error: string }[];
};

async function deleteKeysQuietly(keys: string[]) {
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[dam] staging cleanup skipped", result.reason);
    }
  }
}

async function publishOne(
  userId: string,
  item: PublishItem,
): Promise<{ error?: string }> {
  const notes = item.notes.trim();
  if (!notes) return { error: "Kontext fehlt." };
  const collectionIds = uniqueIds(item.collectionIds).slice(0, 20);
  if (collectionIds.length === 0) return { error: "Collection fehlt." };

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

  const collections = await prisma.collection.findMany({
    where: { id: { in: collectionIds } },
    select: { id: true },
  });
  if (collections.length !== collectionIds.length) {
    return { error: "Collection nicht gefunden." };
  }

  const original = await getObjectBuffer(asset.r2Key);
  if (!looksLikeImageBytes(original)) {
    return { error: "Datei ist kein Bild." };
  }

  const archiveKey = buildArchiveKey({
    userId,
    assetId: asset.id,
    ext: fileExtension(asset.r2Key),
  });
  const contentType = sniffImageContentType(original) ?? "image/jpeg";
  await putObject(archiveKey, original, contentType);
  await writeEditedDerivatives(archiveKey, original, asset.editParams);

  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      r2Key: archiveKey,
      notes,
      status: "published",
      publishedAt: new Date(),
      collections: {
        deleteMany: {},
        create: collectionIds.map((collectionId) => ({ collectionId })),
      },
    },
  });
  await deleteKeysQuietly(r2KeysForAsset(asset.r2Key));
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
