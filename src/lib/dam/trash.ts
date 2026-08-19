import { canDeleteAsset } from "@/lib/dam/can-delete";
import { r2KeysForAsset } from "@/lib/dam/r2-keys";
import {
  incompleteBatchCutoffDate,
  rejectedCutoffDate,
  trashCutoffDate,
  TRASH_BATCH_MAX,
} from "@/lib/dam/trash-policy";
import { prisma } from "@/lib/db";
import { deleteObject, listObjectKeys } from "@/lib/r2";

export {
  INCOMPLETE_BATCH_RETENTION_DAYS,
  REJECTED_RETENTION_DAYS,
  TRASH_BATCH_MAX,
  TRASH_RETENTION_DAYS,
  incompleteBatchCutoffDate,
  rejectedCutoffDate,
  trashCutoffDate,
  trashDaysRemaining,
} from "@/lib/dam/trash-policy";

// ShareLink (Phase 7) is not in the schema yet. Downloads stay published-only,
// so a later public share URL must keep checking status === "published".

async function deleteR2Keys(r2Key: string): Promise<void> {
  const keys = r2KeysForAsset(r2Key);
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length === keys.length) {
    const reason = failed[0]?.status === "rejected" ? failed[0].reason : null;
    throw reason instanceof Error ? reason : new Error("R2-Dateien konnten nicht gelöscht werden.");
  }
  for (const result of failed) {
    if (result.status === "rejected") {
      console.warn("[dam] r2 delete skipped", result.reason);
    }
  }
}

export async function movePublishedAssetsToTrash(
  userId: string,
  assetIds: string[],
): Promise<{ ids: string[]; error?: string }> {
  const unique = [...new Set(assetIds)].slice(0, TRASH_BATCH_MAX);
  if (unique.length === 0) return { ids: [], error: "Keine Bilder gewählt." };

  const rows = await prisma.asset.findMany({
    where: { id: { in: unique }, status: "published" },
    select: { id: true, status: true, uploadedBy: true },
  });
  const allowed = rows.filter((asset) => canDeleteAsset({ id: userId }, asset));
  if (allowed.length === 0) return { ids: [], error: "Bild nicht gefunden." };

  const ids = allowed.map((asset) => asset.id);
  const now = new Date();
  await prisma.asset.updateMany({
    where: { id: { in: ids }, status: "published" },
    data: { status: "archived", deletedAt: now, deletedBy: userId },
  });
  return { ids };
}

export async function restoreTrashedAssets(
  userId: string,
  assetIds: string[],
): Promise<{ ids: string[]; error?: string }> {
  const unique = [...new Set(assetIds)].slice(0, TRASH_BATCH_MAX);
  if (unique.length === 0) return { ids: [], error: "Keine Bilder gewählt." };

  const rows = await prisma.asset.findMany({
    where: { id: { in: unique }, status: "archived" },
    select: { id: true, status: true, uploadedBy: true },
  });
  const allowed = rows.filter((asset) => canDeleteAsset({ id: userId }, asset));
  if (allowed.length === 0) return { ids: [], error: "Bild nicht gefunden." };

  const ids = allowed.map((asset) => asset.id);
  await prisma.asset.updateMany({
    where: { id: { in: ids }, status: "archived" },
    data: { status: "published", deletedAt: null, deletedBy: null },
  });
  return { ids };
}

export async function purgeAssetById(
  userId: string,
  assetId: string,
): Promise<{ error?: string }> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, status: { in: ["archived", "rejected"] } },
    select: { id: true, status: true, uploadedBy: true, r2Key: true },
  });
  if (!asset || !canDeleteAsset({ id: userId }, asset)) {
    return { error: "Bild nicht gefunden." };
  }
  try {
    await deleteR2Keys(asset.r2Key);
  } catch (error) {
    console.error("[dam] purge r2 failed", asset.id, error);
    return { error: "Datei in R2 konnte nicht gelöscht werden." };
  }
  await prisma.asset.delete({ where: { id: asset.id } });
  return {};
}

export type DamPurgeSummary = {
  archived: number;
  rejected: number;
  incomplete: number;
  errors: number;
};

export async function purgeExpiredDamAssets(now = new Date()): Promise<DamPurgeSummary> {
  const archived = await prisma.asset.findMany({
    where: {
      status: "archived",
      deletedAt: { lt: trashCutoffDate(now) },
    },
    select: { id: true, r2Key: true },
    take: 200,
  });
  const rejected = await prisma.asset.findMany({
    where: {
      status: "rejected",
      updatedAt: { lt: rejectedCutoffDate(now) },
    },
    select: { id: true, r2Key: true },
    take: 200,
  });

  let archivedCount = 0;
  let rejectedCount = 0;
  let incompleteCount = 0;
  let errors = 0;

  for (const asset of archived) {
    try {
      await deleteR2Keys(asset.r2Key);
      await prisma.asset.delete({ where: { id: asset.id } });
      archivedCount += 1;
    } catch (error) {
      errors += 1;
      console.error("[dam] expired trash purge failed", asset.id, error);
    }
  }
  for (const asset of rejected) {
    try {
      await deleteR2Keys(asset.r2Key);
      await prisma.asset.delete({ where: { id: asset.id } });
      rejectedCount += 1;
    } catch (error) {
      errors += 1;
      console.error("[dam] rejected purge failed", asset.id, error);
    }
  }

  const incomplete = await prisma.uploadBatch.findMany({
    where: {
      createdAt: { lt: incompleteBatchCutoffDate(now) },
      assets: { none: {} },
    },
    select: { id: true, uploadedBy: true },
    take: 50,
  });
  for (const batch of incomplete) {
    try {
      const prefix = `staging/${batch.uploadedBy}/${batch.id}/`;
      const keys = await listObjectKeys(prefix);
      const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        for (const result of failed) {
          if (result.status === "rejected") {
            console.warn("[dam] incomplete batch r2 delete skipped", result.reason);
          }
        }
        throw new Error("R2-Dateien konnten nicht vollständig gelöscht werden.");
      }
      await prisma.uploadBatch.delete({ where: { id: batch.id } });
      incompleteCount += 1;
    } catch (error) {
      errors += 1;
      console.error("[dam] incomplete batch purge failed", batch.id, error);
    }
  }

  return {
    archived: archivedCount,
    rejected: rejectedCount,
    incomplete: incompleteCount,
    errors,
  };
}

export async function listTrashedAssets() {
  return prisma.asset.findMany({
    where: { status: "archived" },
    orderBy: [{ deletedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      fileName: true,
      credit: true,
      altText: true,
      deletedAt: true,
      deletedBy: true,
      width: true,
      height: true,
    },
  });
}
