"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createEmptyCoverSlide, parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";

const idSchema = z.string().min(1);
const titleSchema = z.string().min(1).max(200);

export async function createCarouselPost(title?: string) {
  const { session } = await requireMembership();
  const resolvedTitle =
    title && titleSchema.safeParse(title).success
      ? title.trim()
      : "Neues Carousel";

  const post = await prisma.carouselPost.create({
    data: {
      title: resolvedTitle,
      slides: [createEmptyCoverSlide()] as unknown as Prisma.InputJsonValue,
      createdById: session.user.id,
    },
  });

  revalidatePath("/carousel");
  return { id: post.id };
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
