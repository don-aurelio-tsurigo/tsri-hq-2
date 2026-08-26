import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/r2";
import {
  assertWikiR2Key,
  extractWikiImageIds,
} from "@/lib/wiki-images";

/**
 * Delete WikiImage rows + R2 objects that are no longer referenced by any
 * page in the organization. Safe to call with candidates from a save/delete.
 */
export async function purgeUnreferencedWikiImages(
  organizationId: string,
  candidateIds: Iterable<string>,
): Promise<void> {
  const unique = [...new Set(candidateIds)].filter(Boolean);
  if (unique.length === 0) return;

  const pages = await prisma.wikiPage.findMany({
    where: { organizationId },
    select: { body: true },
  });
  const stillUsed = new Set<string>();
  for (const page of pages) {
    for (const id of extractWikiImageIds(page.body)) {
      stillUsed.add(id);
    }
  }

  const orphanIds = unique.filter((id) => !stillUsed.has(id));
  if (orphanIds.length === 0) return;

  const rows = await prisma.wikiImage.findMany({
    where: { organizationId, id: { in: orphanIds } },
    select: { id: true, r2Key: true, organizationId: true },
  });

  for (const row of rows) {
    try {
      assertWikiR2Key(row.r2Key, row.organizationId);
      await deleteObject(row.r2Key);
    } catch (error) {
      console.warn("[wiki] R2 delete failed for", row.id, error);
    }
  }

  if (rows.length > 0) {
    await prisma.wikiImage.deleteMany({
      where: {
        organizationId,
        id: { in: rows.map((r) => r.id) },
      },
    });
  }
}
