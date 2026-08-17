import { prisma } from "@/lib/db";
import { getObject } from "@/lib/r2";
import { uploadImageToWepublish } from "@/lib/wepublish/upload-image";

export const wepublishExportLogSelect = {
  where: { targetUrl: { not: null } },
  orderBy: { exportedAt: "desc" as const },
  take: 1,
  select: { exportedAt: true, targetUrl: true },
};

export function latestWepublishExportedAt(
  logs: { exportedAt: Date }[],
): string | null {
  return logs[0]?.exportedAt.toISOString() ?? null;
}

export type WepublishExportResult = {
  imageId: string;
  imageUrl: string;
  exportedAt: string;
};

export async function exportPublishedAssetToWepublish(
  userId: string,
  assetId: string,
): Promise<{ error: string } | WepublishExportResult> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, status: "published" },
    select: {
      id: true,
      fileName: true,
      r2Key: true,
      credit: true,
      altText: true,
    },
  });
  if (!asset) return { error: "Publiziertes Bild nicht gefunden." };

  const file = await getObject(asset.r2Key);
  const uploaded = await uploadImageToWepublish(
    {
      buffer: file.buffer,
      contentType: file.contentType || "image/jpeg",
      fileName: asset.fileName,
    },
    {
      fileName: asset.fileName,
      altText: asset.altText,
      credit: asset.credit,
    },
  );

  const log = await prisma.exportLog.create({
    data: {
      assetId: asset.id,
      exportedBy: userId,
      targetUrl: uploaded.url,
    },
    select: { exportedAt: true },
  });

  return {
    imageId: uploaded.id,
    imageUrl: uploaded.url,
    exportedAt: log.exportedAt.toISOString(),
  };
}
