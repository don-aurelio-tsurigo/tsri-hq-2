"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  AiGenerationError,
  generateSlidesFromArticle,
  generateSlidesFromPastedText,
} from "@/lib/ai/anthropic";
import { prisma } from "@/lib/db";
import { createEmptyCoverSlide, defaultCategoryForFormat } from "@/lib/carousel/slides";
import { parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";
import { parseCarouselFormat } from "@/lib/carousel/format";
import { fetchTsriArticleByUrl } from "@/lib/wepublish/article";
import { WepublishApiError } from "@/lib/wepublish/client";
import { consumeMemberQuota, refundMemberQuota } from "@/lib/member-quota";

const idSchema = z.string().min(1);
const titleSchema = z.string().min(1).max(200);
const urlSchema = z.string().min(8).max(500);
const pastedTextSchema = z.string().trim().min(80).max(50_000);

export async function createCarouselPost(
  title?: string | FormData,
  format?: string,
) {
  const { session } = await requireMembership();
  const rawTitle =
    typeof title === "string"
      ? title
      : title instanceof FormData
        ? String(title.get("title") ?? "")
        : "";
  const resolvedTitle =
    rawTitle && titleSchema.safeParse(rawTitle).success
      ? rawTitle.trim()
      : "Neues Carousel";
  const resolvedFormat = parseCarouselFormat(
    title instanceof FormData ? title.get("format") : format,
  );

  const post = await prisma.carouselPost.create({
    data: {
      title: resolvedTitle,
      format: resolvedFormat,
      slides: [
        createEmptyCoverSlide(defaultCategoryForFormat(resolvedFormat)),
      ] as unknown as Prisma.InputJsonValue,
      createdById: session.user.id,
    },
  });

  revalidatePath("/carousel");
  redirect(`/carousel/${post.id}`);
}

export async function importCarouselFromArticleUrl(
  articleUrl: string,
  format?: string,
): Promise<{ error: string }> {
  const { session } = await requireMembership();
  const parsedUrl = urlSchema.safeParse(articleUrl?.trim() ?? "");
  if (!parsedUrl.success) {
    return { error: "Bitte eine gültige Artikel-URL einfügen." };
  }
  const resolvedFormat = parseCarouselFormat(format);

  try {
    const article = await fetchTsriArticleByUrl(parsedUrl.data);
    const quota = await consumeMemberQuota(session.user.id, "ai");
    if (!quota.ok) return { error: quota.error };

    try {
      const slides = await generateSlidesFromArticle(article, resolvedFormat);
      const minSlides =
        resolvedFormat === "tsueritipp" || resolvedFormat === "6ibrief" ? 3 : 6;
      if (slides.length < minSlides) {
        return { error: "Zu wenige Slides erzeugt. Bitte erneut versuchen." };
      }

      const title =
        article.title.length > 200
          ? `${article.title.slice(0, 197)}…`
          : article.title;

      const post = await prisma.carouselPost.create({
        data: {
          title,
          format: resolvedFormat,
          slides: slides as unknown as Prisma.InputJsonValue,
          sourceUrl: article.url,
          sourcePreTitle: article.preTitle,
          sourceTitle: article.title,
          sourceLead: article.lead,
          sourceBody: article.bodyText,
          createdById: session.user.id,
        },
      });

      revalidatePath("/carousel");
      redirect(`/carousel/${post.id}`);
    } catch (error) {
      unstable_rethrow(error);
      await refundMemberQuota(quota.id);
      throw error;
    }
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof WepublishApiError || error instanceof AiGenerationError) {
      return { error: error.message };
    }
    console.error("importCarouselFromArticleUrl", error);
    return { error: "Import fehlgeschlagen. Bitte später erneut versuchen." };
  }
}

export async function importCarouselFromPastedText(
  pastedText: string,
  format?: string,
): Promise<{ error: string }> {
  const { session } = await requireMembership();
  const parsedText = pastedTextSchema.safeParse(pastedText ?? "");
  if (!parsedText.success) {
    return {
      error: "Bitte mindestens 80 Zeichen Text einfügen.",
    };
  }
  const resolvedFormat = parseCarouselFormat(format);

  const quota = await consumeMemberQuota(session.user.id, "ai");
  if (!quota.ok) return { error: quota.error };

  try {
    const { slides, title } = await generateSlidesFromPastedText(
      parsedText.data,
      resolvedFormat,
    );
    const minSlides =
      resolvedFormat === "tsueritipp" || resolvedFormat === "6ibrief" ? 3 : 6;
    if (slides.length < minSlides) {
      await refundMemberQuota(quota.id);
      return { error: "Zu wenige Slides erzeugt. Bitte erneut versuchen." };
    }

    const post = await prisma.carouselPost.create({
      data: {
        title,
        format: resolvedFormat,
        slides: slides as unknown as Prisma.InputJsonValue,
        sourceBody: parsedText.data,
        sourceTitle: title,
        sourcePreTitle: resolvedFormat === "6ibrief" ? "6iBRIEF" : null,
        createdById: session.user.id,
      },
    });

    revalidatePath("/carousel");
    redirect(`/carousel/${post.id}`);
  } catch (error) {
    unstable_rethrow(error);
    await refundMemberQuota(quota.id);
    if (error instanceof AiGenerationError) {
      return { error: error.message };
    }
    console.error("importCarouselFromPastedText", error);
    return { error: "Import fehlgeschlagen. Bitte später erneut versuchen." };
  }
}

export async function updateCarouselSlides(
  id: string,
  slides: unknown,
  title?: string,
) {
  const { session } = await requireMembership();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { error: "Ungültige ID." };
  }

  const existing = await prisma.carouselPost.findUnique({
    where: { id: parsedId.data },
    select: { createdById: true },
  });
  if (!existing) {
    return { error: "Carousel nicht gefunden." };
  }
  if (existing.createdById !== session.user.id) {
    return { error: "Nur der Ersteller darf dieses Carousel bearbeiten." };
  }

  if (!Array.isArray(slides)) {
    return { error: "Slides müssen ein Array sein." };
  }
  const nextSlides = parseSlides(slides as Prisma.JsonValue);

  const data: { slides: Prisma.InputJsonValue; title?: string } = {
    slides: nextSlides as unknown as Prisma.InputJsonValue,
  };
  if (title !== undefined) {
    const parsedTitle = titleSchema.safeParse(title);
    if (!parsedTitle.success) {
      return { error: "Titel fehlt oder ist ungültig." };
    }
    data.title = parsedTitle.data.trim();
  }

  await prisma.carouselPost.update({
    where: { id: parsedId.data },
    data,
  });

  revalidatePath("/carousel");
  revalidatePath(`/carousel/${parsedId.data}`);
  return { ok: true as const };
}

export async function deleteCarouselPost(formData: FormData) {
  const { session } = await requireMembership();
  const parsedId = idSchema.safeParse(formData.get("id"));
  if (!parsedId.success) {
    return { error: "Ungültige ID." };
  }

  const existing = await prisma.carouselPost.findUnique({
    where: { id: parsedId.data },
    select: { createdById: true },
  });
  if (!existing) {
    return { error: "Carousel nicht gefunden." };
  }
  if (existing.createdById !== session.user.id) {
    return { error: "Nur der Ersteller darf dieses Carousel löschen." };
  }

  await prisma.carouselPost.delete({ where: { id: parsedId.data } });
  revalidatePath("/carousel");
  return { ok: true as const };
}
