import type { AppCapability } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { TAG_POOL_KEYS, type TagPool } from "@/lib/permissions";

export async function listMembersInTagPool(
  organizationId: string,
  pool: TagPool,
) {
  const keys: AppCapability[] = TAG_POOL_KEYS[pool];
  return prisma.membership.findMany({
    where: {
      organizationId,
      archivedAt: null,
      grants: { some: { capability: { in: keys } } },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

export async function membershipInTagPool(
  organizationId: string,
  userId: string,
  pool: TagPool,
): Promise<boolean> {
  const keys: AppCapability[] = TAG_POOL_KEYS[pool];
  const count = await prisma.membership.count({
    where: {
      organizationId,
      userId,
      archivedAt: null,
      grants: { some: { capability: { in: keys } } },
    },
  });
  return count > 0;
}

export function mergePickerMembers(
  primary: { id: string; name: string }[],
  extras: ({ id: string; name: string } | null | undefined)[],
) {
  const map = new Map(primary.map((u) => [u.id, u]));
  for (const extra of extras) {
    if (extra?.id && !map.has(extra.id)) {
      map.set(extra.id, { id: extra.id, name: extra.name });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}
