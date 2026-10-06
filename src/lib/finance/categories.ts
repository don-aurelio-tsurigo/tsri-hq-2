import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { FinanceKind } from "./shared";

export type AdminCategory = {
  id: string;
  name: string;
  kind: FinanceKind;
  group: string | null;
  sortOrder: number;
  liquidityOnly: boolean;
  validFrom: number | null;
  validUntil: number | null;
  archived: boolean;
  bookingCount: number;
  budgetCount: number;
};

export async function listAdminCategories(organizationId: string): Promise<AdminCategory[]> {
  const rows = await prisma.financeCategory.findMany({
    where: { organizationId },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { bookings: true, budgetEntries: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as FinanceKind,
    group: c.group,
    sortOrder: c.sortOrder,
    liquidityOnly: c.liquidityOnly,
    validFrom: c.validFrom,
    validUntil: c.validUntil,
    archived: c.archivedAt !== null,
    bookingCount: c._count.bookings,
    budgetCount: c._count.budgetEntries,
  }));
}

export class CategoryError extends Error {}

function assertValidity(validFrom: number | null, validUntil: number | null) {
  for (const y of [validFrom, validUntil]) {
    if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) {
      throw new CategoryError("Ungültiges Jahr.");
    }
  }
  if (validFrom !== null && validUntil !== null && validFrom > validUntil) {
    throw new CategoryError("«Gültig ab» liegt nach «gültig bis».");
  }
}

function rethrowUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new CategoryError("Es gibt schon eine Kategorie mit diesem Namen.");
  }
  throw e;
}

export async function createCategory(input: {
  organizationId: string;
  name: string;
  kind: FinanceKind;
  group: string | null;
  validFrom: number | null;
}) {
  assertValidity(input.validFrom, null);
  const last = await prisma.financeCategory.aggregate({
    where: { organizationId: input.organizationId, kind: input.kind },
    _max: { sortOrder: true },
  });
  try {
    await prisma.financeCategory.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        kind: input.kind,
        group: input.group,
        validFrom: input.validFrom,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
  } catch (e) {
    rethrowUnique(e);
  }
}

export async function updateCategory(
  organizationId: string,
  id: string,
  patch: {
    name?: string;
    group?: string | null;
    liquidityOnly?: boolean;
    validFrom?: number | null;
    validUntil?: number | null;
    archived?: boolean;
  },
) {
  const current = await prisma.financeCategory.findFirst({ where: { id, organizationId } });
  if (!current) throw new CategoryError("Kategorie nicht gefunden.");
  assertValidity(
    patch.validFrom !== undefined ? patch.validFrom : current.validFrom,
    patch.validUntil !== undefined ? patch.validUntil : current.validUntil,
  );
  const { archived, ...rest } = patch;
  try {
    await prisma.financeCategory.update({
      where: { id },
      data: {
        ...rest,
        ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
      },
    });
  } catch (e) {
    rethrowUnique(e);
  }
}

/** Move one step up/down within its kind and renumber that kind 1..n. */
export async function moveCategory(organizationId: string, id: string, direction: -1 | 1) {
  const current = await prisma.financeCategory.findFirst({ where: { id, organizationId } });
  if (!current) throw new CategoryError("Kategorie nicht gefunden.");
  const siblings = await prisma.financeCategory.findMany({
    where: { organizationId, kind: current.kind },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const ids = siblings.map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await prisma.$transaction(
    ids.map((cid, index) =>
      prisma.financeCategory.update({ where: { id: cid }, data: { sortOrder: index + 1 } }),
    ),
  );
}
