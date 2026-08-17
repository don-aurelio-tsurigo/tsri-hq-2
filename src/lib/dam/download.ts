import { MAX_ARCHIVE_DOWNLOADS } from "@/lib/dam/download-constants";
import { prisma } from "@/lib/db";
import { presignGetUrl, R2_DOWNLOAD_EXPIRES_IN } from "@/lib/r2";

export type SignedDownloadFile = {
  id: string;
  url: string;
  fileName: string;
};

export async function createPublishedDownloadLinks(
  userId: string,
  assetIds: string[],
): Promise<{ files: SignedDownloadFile[]; expiresIn: number } | { error: string }> {
  const unique = [...new Set(assetIds)].slice(0, MAX_ARCHIVE_DOWNLOADS);
  if (unique.length === 0) return { error: "Keine Bilder gewählt." };

  const assets = await prisma.asset.findMany({
    where: { id: { in: unique }, status: "published" },
    select: { id: true, r2Key: true, fileName: true },
  });
  if (assets.length === 0) return { error: "Keine publizierten Bilder gefunden." };

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ordered = unique
    .map((id) => byId.get(id))
    .filter((asset): asset is (typeof assets)[number] => Boolean(asset));

  const files: SignedDownloadFile[] = await Promise.all(
    ordered.map(async (asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      url: await presignGetUrl(asset.r2Key, {
        expiresIn: R2_DOWNLOAD_EXPIRES_IN,
        fileName: asset.fileName,
      }),
    })),
  );

  await prisma.exportLog.createMany({
    data: files.map((file) => ({
      assetId: file.id,
      exportedBy: userId,
    })),
  });

  return { files, expiresIn: R2_DOWNLOAD_EXPIRES_IN };
}
