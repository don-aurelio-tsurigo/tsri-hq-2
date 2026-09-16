import { MAX_ARCHIVE_DOWNLOADS } from "@/lib/dam/download-constants";
import {
  publishedDownloadPath,
  type DamDownloadFormat,
} from "@/lib/dam/download-path";
import { replaceKeyExtension } from "@/lib/dam/filename";
import { prisma } from "@/lib/db";

export type { DamDownloadFormat } from "@/lib/dam/download-path";
export { publishedDownloadPath, publishedExportPath } from "@/lib/dam/download-path";

export type SignedDownloadFile = {
  id: string;
  url: string;
  fileName: string;
};

export async function createPublishedDownloadLinks(
  userId: string,
  assetIds: string[],
  format: DamDownloadFormat = "jpeg",
): Promise<{ files: SignedDownloadFile[]; expiresIn: number } | { error: string }> {
  const unique = [...new Set(assetIds)].slice(0, MAX_ARCHIVE_DOWNLOADS);
  if (unique.length === 0) return { error: "Keine Bilder gewählt." };

  const assets = await prisma.asset.findMany({
    where: { id: { in: unique }, status: "published" },
    select: { id: true, fileName: true },
  });
  if (assets.length === 0) return { error: "Keine publizierten Bilder gefunden." };

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ordered = unique
    .map((id) => byId.get(id))
    .filter((asset): asset is (typeof assets)[number] => Boolean(asset));

  const files: SignedDownloadFile[] = ordered.map((asset) => ({
    id: asset.id,
    fileName:
      format === "jpeg"
        ? replaceKeyExtension(asset.fileName, "jpg")
        : asset.fileName,
    url: publishedDownloadPath(asset.id, format),
  }));

  await prisma.exportLog.createMany({
    data: files.map((file) => ({
      assetId: file.id,
      exportedBy: userId,
    })),
  });

  return { files, expiresIn: 120 };
}
