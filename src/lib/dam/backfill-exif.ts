import type { Prisma } from "@/generated/prisma/client";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { extractExif, resolveTakenAt } from "@/lib/dam/exif";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";

/** Read EXIF from the current R2 original and persist takenAt/dimensions. */
export async function backfillAssetExif(assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      r2Key: true,
      takenAt: true,
      width: true,
      height: true,
    },
  });
  if (!asset) return;
  if (asset.takenAt && asset.width && asset.height) return;

  try {
    const { buffer, metadata } = await getObject(asset.r2Key);
    if (!looksLikeImageBytes(buffer)) return;

    const exif = await extractExif(buffer);
    const takenAt = resolveTakenAt({
      exifTakenAt: exif.takenAt,
      metadata,
      existing: asset.takenAt,
    });

    const data: Prisma.AssetUpdateInput = {};
    if (takenAt && !asset.takenAt) data.takenAt = takenAt;
    if (exif.json) data.exif = exif.json;
    if (!asset.width && exif.width) data.width = exif.width;
    if (!asset.height && exif.height) data.height = exif.height;
    if (Object.keys(data).length === 0) return;

    await prisma.asset.update({ where: { id: assetId }, data });
  } catch (error) {
    console.warn(`[dam] exif backfill failed for ${assetId}`, error);
  }
}
