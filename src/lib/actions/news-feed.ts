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
import { AiGenerationError } from "@/lib/ai/anthropic";
import { generateKurzmeldungFromFeedItem } from "@/lib/rag/generate-article";
import { sourceAutoFetchesFulltext } from "@/lib/news-feed-constants";
import { fetchStadtMedienmitteilungFulltext } from "@/lib/news-feed-fetch";

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

/** KI-Kurzmeldung aus einem Newsfeed-Item (RAG + Claude). */
export async function generateNewsArticleAction(
  newsItemId: string,
  pastedSourceText?: string,
) {
  const { membership } = await requireMembership();
  if (!newsItemId?.trim()) {
    return { error: "Kein Feed-Item angegeben." };
  }

  const item = await prisma.newsItem.findFirst({
    where: {
      id: newsItemId,
      organizationId: membership.organizationId,
    },
    select: {
      id: true,
      title: true,
      summary: true,
      link: true,
      source: true,
      sourceLabel: true,
    },
  });
  if (!item) return { error: "Eintrag nicht gefunden." };

  const pasted = pastedSourceText?.trim() ?? "";
  const autoFulltext = sourceAutoFetchesFulltext(item.source);

  let sourceText = pasted;
  if (!sourceText && autoFulltext) {
    // Gespeicherter Volltext oder Live-Nachladen von der Stadt-Seite
    if ((item.summary?.length ?? 0) >= 200) {
      sourceText = item.summary ?? "";
    } else {
      const full = await fetchStadtMedienmitteilungFulltext(item.link);
      if (full) {
        sourceText = full;
        await prisma.newsItem.update({
          where: { id: item.id },
          data: { summary: full.slice(0, 20_000) },
        });
      }
    }
  }

  if (!autoFulltext && pasted.length < 120) {
    return {
      error:
        "Bitte den vollständigen Artikeltext einfügen (Paywall/Teaser-Quellen).",
    };
  }
  if (autoFulltext && sourceText.length < 120) {
    return {
      error:
        "Volltext der Stadt-Medienmitteilung konnte nicht geladen werden. Bitte Text manuell einfügen.",
    };
  }

  try {
    const result = await generateKurzmeldungFromFeedItem({
      title: item.title,
      summary: item.summary,
      sourceText,
      link: item.link,
      sourceLabel: item.sourceLabel,
    });
    return {
      ok: true as const,
      draft: result.draft,
      ragHitCount: result.ragHitCount,
      ragWarning: result.ragWarning,
    };
  } catch (err) {
    if (err instanceof AiGenerationError) {
      return { error: err.message };
    }
    console.error("[generateNewsArticleAction]", err);
    return { error: "Artikel-Generierung fehlgeschlagen." };
  }
}
