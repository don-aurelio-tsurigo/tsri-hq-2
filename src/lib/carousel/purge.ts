import { prisma } from "@/lib/db";

export const CAROUSEL_RETENTION_DAYS = 30;

export async function purgeExpiredCarouselPosts(now = new Date()) {
  const cutoff = new Date(
    now.getTime() - CAROUSEL_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.carouselPost.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff };
}
