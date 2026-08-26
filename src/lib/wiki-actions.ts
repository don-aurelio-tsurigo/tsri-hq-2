"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import {
  getWikiSpace,
  uniqueWikiSlug,
} from "@/lib/wiki";
import { extractWikiImageIds } from "@/lib/wiki-images";
import { purgeUnreferencedWikiImages } from "@/lib/wiki-image-purge";

async function revalidateWiki(_organizationId: string, spaceId: string) {
  revalidatePath(`/spaces/${spaceId}`);
  revalidatePath("/", "layout");
}

async function loadOwnedPage(pageId: string, organizationId: string) {
  return prisma.wikiPage.findFirst({
    where: { id: pageId, organizationId },
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  parentId: z.string().optional(),
  body: z.string().optional(),
});

export async function createWikiPage(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    parentId: formData.get("parentId") || undefined,
    body: formData.get("body") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Titel fehlt oder ist ungültig." };
  }

  const space = await getWikiSpace(membership.organizationId);
  if (!space) return { error: "Wiki-Space nicht gefunden." };

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await loadOwnedPage(
      parsed.data.parentId,
      membership.organizationId,
    );
    if (!parent || parent.spaceId !== space.id) {
      return { error: "Übergeordnete Seite nicht gefunden." };
    }
    parentId = parent.id;
  }

  const siblings = await prisma.wikiPage.count({
    where: {
      organizationId: membership.organizationId,
      spaceId: space.id,
      parentId,
    },
  });

  const slug = await uniqueWikiSlug(
    membership.organizationId,
    parsed.data.title,
  );

  const title = parsed.data.title;
  const body =
    parsed.data.body?.trim() ||
    `# ${title}\n\n_Noch kein Inhalt — bitte ergänzen._\n`;

  const page = await prisma.wikiPage.create({
    data: {
      organizationId: membership.organizationId,
      spaceId: space.id,
      title,
      slug,
      body,
      parentId,
      sortOrder: siblings,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });

  await revalidateWiki(membership.organizationId, space.id);
  return { ok: true as const, slug: page.slug };
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  body: z.string(),
});

export async function updateWikiPage(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { error: "Ungültige Eingabe." };
  }

  const existing = await loadOwnedPage(
    parsed.data.id,
    membership.organizationId,
  );
  if (!existing) return { error: "Seite nicht gefunden." };

  const slug =
    parsed.data.title === existing.title
      ? existing.slug
      : await uniqueWikiSlug(
          membership.organizationId,
          parsed.data.title,
          existing.id,
        );

  const previousImageIds = extractWikiImageIds(existing.body);
  const nextImageIds = extractWikiImageIds(parsed.data.body);
  const removedImageIds = [...previousImageIds].filter(
    (id) => !nextImageIds.has(id),
  );

  const page = await prisma.wikiPage.update({
    where: { id: existing.id },
    data: {
      title: parsed.data.title,
      slug,
      body: parsed.data.body,
      updatedById: session.user.id,
    },
  });

  if (removedImageIds.length > 0) {
    await purgeUnreferencedWikiImages(
      membership.organizationId,
      removedImageIds,
    );
  }

  await revalidateWiki(membership.organizationId, existing.spaceId);
  return { ok: true as const, slug: page.slug };
}

export async function toggleWikiPin(formData: FormData) {
  const { session, membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const existing = await loadOwnedPage(id, membership.organizationId);
  if (!existing) return { error: "Seite nicht gefunden." };

  if (!existing.pinned) {
    const pinnedCount = await prisma.wikiPage.count({
      where: { organizationId: membership.organizationId, pinned: true },
    });
    if (pinnedCount >= 8) {
      return { error: "Maximal 8 Pins. Bitte einen anderen lösen." };
    }
  }

  await prisma.wikiPage.update({
    where: { id: existing.id },
    data: {
      pinned: !existing.pinned,
      updatedById: session.user.id,
    },
  });

  await revalidateWiki(membership.organizationId, existing.spaceId);
  return { ok: true as const };
}

const moveSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function moveWikiPage(formData: FormData) {
  const { session, membership } = await requireMembership();
  const parsed = moveSchema.safeParse({
    id: formData.get("id"),
    parentId: formData.get("parentId") || undefined,
    sortOrder: formData.get("sortOrder") ?? undefined,
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  const existing = await loadOwnedPage(
    parsed.data.id,
    membership.organizationId,
  );
  if (!existing) return { error: "Seite nicht gefunden." };

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    if (parsed.data.parentId === existing.id) {
      return { error: "Seite kann nicht unter sich selbst liegen." };
    }
    const parent = await loadOwnedPage(
      parsed.data.parentId,
      membership.organizationId,
    );
    if (!parent || parent.spaceId !== existing.spaceId) {
      return { error: "Übergeordnete Seite nicht gefunden." };
    }
    // Prevent cycles: walk up from new parent
    let cursor: string | null = parent.id;
    while (cursor) {
      if (cursor === existing.id) {
        return { error: "Ungültige Verschiebung (Zyklus)." };
      }
      const row: { parentId: string | null } | null =
        await prisma.wikiPage.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = row?.parentId ?? null;
    }
    parentId = parent.id;
  }

  await prisma.wikiPage.update({
    where: { id: existing.id },
    data: {
      parentId,
      ...(parsed.data.sortOrder !== undefined
        ? { sortOrder: parsed.data.sortOrder }
        : {}),
      updatedById: session.user.id,
    },
  });

  await revalidateWiki(membership.organizationId, existing.spaceId);
  return { ok: true as const };
}

export async function deleteWikiPage(formData: FormData) {
  const { membership } = await requireMembership();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Fehlende ID." };

  const existing = await loadOwnedPage(id, membership.organizationId);
  if (!existing) return { error: "Seite nicht gefunden." };

  const childCount = await prisma.wikiPage.count({
    where: { parentId: existing.id },
  });
  if (childCount > 0) {
    return {
      error: "Seite hat Unterseiten. Bitte zuerst die Unterseiten löschen.",
    };
  }

  const imageIds = extractWikiImageIds(existing.body);
  await prisma.wikiPage.delete({ where: { id: existing.id } });
  if (imageIds.size > 0) {
    await purgeUnreferencedWikiImages(membership.organizationId, imageIds);
  }
  await revalidateWiki(membership.organizationId, existing.spaceId);
  return { ok: true as const };
}
