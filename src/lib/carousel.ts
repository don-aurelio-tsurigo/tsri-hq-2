import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createEmptyCoverSlide, createEmptyTextSlide } from "@/lib/carousel/slides";
import type { Slide, TippItemSlide } from "@/lib/carousel/types";

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
  return value.map((raw) => {
    const slide = raw as Slide;
    if (slide?.type === "tipp-item") {
      return tippItemToTextSlide(slide);
    }
    return slide;
  });
}

function escapeSlideText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tippItemToTextSlide(slide: TippItemSlide): Slide {
  const text = createEmptyTextSlide(slide.category);
  const bodyHtml = slide.items
    .map((item) => {
      const chunks: string[] = [];
      if (item.title.trim()) {
        chunks.push(`<b>${escapeSlideText(item.title.trim())}</b>`);
      }
      if (item.body.trim()) chunks.push(escapeSlideText(item.body.trim()));
      if (item.meta.trim()) chunks.push(escapeSlideText(item.meta.trim()));
      return chunks.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return {
    ...text,
    id: slide.id,
    backgroundColor: slide.backgroundColor,
    ink: slide.ink,
    bodyHtml,
    textTransform: slide.textTransform,
  };
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
