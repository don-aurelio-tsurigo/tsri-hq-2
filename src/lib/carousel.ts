import { randomUUID } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_CATEGORY,
  type CoverSlide,
  type Slide,
} from "@/lib/carousel/types";

export function createEmptyCoverSlide(
  category: string = DEFAULT_CATEGORY,
): CoverSlide {
  return {
    id: randomUUID(),
    type: "cover",
    category,
    backgroundImageUrl: null,
    overline: "",
    headline: "",
  };
}

export function parseSlides(value: Prisma.JsonValue): Slide[] {
  if (!Array.isArray(value)) return [];
  return value as Slide[];
}

export async function listCarouselPosts() {
  return prisma.carouselPost.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function getCarouselPost(id: string) {
  return prisma.carouselPost.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });
}
