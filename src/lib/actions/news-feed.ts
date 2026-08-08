"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireMembership } from "@/lib/session";
import { isNewsItemStatus } from "@/lib/news-feed-constants";
import {
  bulkUpdateNewsItemStatus,
  runNewsFeedFetch,
  updateNewsItemStatus,
} from "@/lib/news-feed";

// ─── Newsfeed / Quellen ────────────────────────────────────────

async function revalidateQuellen(organizationId: string) {
  const space = await prisma.space.findFirst({
    where: { organizationId, slug: "quellen" },
    select: { id: true },
  });
  if (space) revalidatePath(`/spaces/${space.id}`);
}

export async function refreshNewsFeed() {
  const { membership } = await requireMembership();
  try {
    const { results, fetched, inserted } = await runNewsFeedFetch(
      membership.organizationId,
    );
    await revalidateQuellen(membership.organizationId);
    return { ok: true as const, results, fetched, inserted };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? err.message
          : "Aktualisieren fehlgeschlagen.",
    };
  }
}

export async function updateNewsItemStatusAction(
  id: string,
  status: string,
) {
  const { membership } = await requireMembership();
  if (!isNewsItemStatus(status)) {
    return { error: "Ungültiger Status." };
  }
  const updated = await updateNewsItemStatus(
    membership.organizationId,
    id,
    status,
  );
  if (!updated) return { error: "Eintrag nicht gefunden." };
  await revalidateQuellen(membership.organizationId);
  return { ok: true as const };
}

export async function bulkUpdateNewsItemStatusAction(
  ids: string[],
  status: string,
) {
  const { membership } = await requireMembership();
  if (!isNewsItemStatus(status)) {
    return { error: "Ungültiger Status." };
  }
  const cleanIds = ids.filter((id) => typeof id === "string" && id.length > 0);
  if (cleanIds.length === 0) return { error: "Keine IDs übergeben." };

  const updated = await bulkUpdateNewsItemStatus(
    membership.organizationId,
    cleanIds,
    status,
  );
  await revalidateQuellen(membership.organizationId);
  return { ok: true as const, updated };
}
