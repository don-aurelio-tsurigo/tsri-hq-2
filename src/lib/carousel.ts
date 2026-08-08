import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createEmptyCoverSlide } from "@/lib/carousel/slides";
import type { Slide } from "@/lib/carousel/types";

export { createEmptyCoverSlide } from "@/lib/carousel/slides";
export {
  createEmptyOutroSlide,
  createEmptyQuoteSlide,
  createEmptySlide,
  createEmptyTextSlide,
  lastCategory,
} from "@/lib/carousel/slides";

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
