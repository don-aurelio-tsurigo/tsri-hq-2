"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { AiGenerationError, generateSlidesFromArticle } from "@/lib/ai/anthropic";
import { prisma } from "@/lib/db";
import { createEmptyCoverSlide } from "@/lib/carousel/slides";
import { parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";
import { fetchTsriArticleByUrl } from "@/lib/wepublish/article";
import { WepublishApiError } from "@/lib/wepublish/client";

const idSchema = z.string().min(1);
const titleSchema = z.string().min(1).max(200);
const urlSchema = z.string().min(8).max(500);

export async function createCarouselPost(title?: string | FormData) {
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

  const post = await prisma.carouselPost.create({
    data: {
      title: resolvedTitle,
      slides: [createEmptyCoverSlide()] as unknown as Prisma.InputJsonValue,
      createdById: session.user.id,
    },
  });

  revalidatePath("/carousel");
  redirect(`/carousel/${post.id}`);
}

export async function importCarouselFromArticleUrl(
  articleUrl: string,
): Promise<{ error: string }> {
  const { session } = await requireMembership();
  const parsedUrl = urlSchema.safeParse(articleUrl?.trim() ?? "");
  if (!parsedUrl.success) {
    return { error: "Bitte eine gültige Artikel-URL einfügen." };
  }

  try {
    const article = await fetchTsriArticleByUrl(parsedUrl.data);
    const slides = await generateSlidesFromArticle(article);
    if (slides.length < 6) {
      return { error: "Zu wenige Slides erzeugt. Bitte erneut versuchen." };
    }

    const title =
      article.title.length > 200
        ? `${article.title.slice(0, 197)}…`
        : article.title;

    const post = await prisma.carouselPost.create({
      data: {
        title,
        slides: slides as unknown as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    });

    revalidatePath("/carousel");
    redirect(`/carousel/${post.id}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof WepublishApiError || error instanceof AiGenerationError) {
      return { error: error.message };
    }
    console.error("importCarouselFromArticleUrl", error);
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
