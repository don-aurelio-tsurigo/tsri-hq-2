import { withPersonKeywords } from "@/lib/dam/keywords";
import { prisma } from "@/lib/db";

/**
 * Recomputes the «Personen» field from confirmed faces and mirrors the names
 * into the asset keywords. Manual entries stay untouched.
 */
export async function syncAssetPersons(
  assetId: string,
  removedNames: string[] = [],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      select: {
        keywords: true,
        faces: { where: { status: "confirmed", personId: { not: null } }, select: { personId: true } },
        persons: { select: { personId: true, source: true, person: { select: { name: true } } } },
      },
    });
    if (!asset) return;

    const facePersonIds = new Set(asset.faces.map((face) => face.personId!));
    const stale = asset.persons.filter(
      (link) => link.source === "face" && !facePersonIds.has(link.personId),
    );
    const linked = new Set(asset.persons.map((link) => link.personId));
    const added = [...facePersonIds].filter((personId) => !linked.has(personId));

    if (stale.length > 0) {
      await tx.assetPerson.deleteMany({
        where: { assetId, personId: { in: stale.map((link) => link.personId) }, source: "face" },
      });
    }
    if (added.length > 0) {
      await tx.assetPerson.createMany({
        data: added.map((personId) => ({ assetId, personId, source: "face" as const })),
        skipDuplicates: true,
      });
    }

    const current = await tx.assetPerson.findMany({
      where: { assetId },
      orderBy: { createdAt: "asc" },
      select: { person: { select: { name: true } } },
    });
    const keywords = withPersonKeywords(
      asset.keywords,
      current.map((link) => link.person.name),
      [...removedNames, ...stale.map((link) => link.person.name)],
    );
    const unchanged =
      keywords.length === asset.keywords.length &&
      keywords.every((keyword, index) => keyword === asset.keywords[index]);
    if (!unchanged) {
      await tx.asset.update({ where: { id: assetId }, data: { keywords } });
    }
  });
}

/** Person names currently linked to an asset, for re-applying after keyword edits. */
export async function assetPersonNames(assetId: string): Promise<string[]> {
  const links = await prisma.assetPerson.findMany({
    where: { assetId },
    orderBy: { createdAt: "asc" },
    select: { person: { select: { name: true } } },
  });
  return links.map((link) => link.person.name);
}
