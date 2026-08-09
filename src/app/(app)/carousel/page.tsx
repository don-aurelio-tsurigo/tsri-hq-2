import { CarouselList } from "@/components/carousel-list";
import { CreateCarouselButton } from "@/components/create-carousel-button";
import { ImportCarouselFromArticle } from "@/components/import-carousel-from-article";
import { listCarouselPosts, parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";

export default async function CarouselIndexPage() {
  const { session } = await requireMembership();
  const posts = await listCarouselPosts();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Redaktion
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Instagram Carousel
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Carousels anlegen, bearbeiten und als PNG exportieren.
          </p>
        </div>
        <CreateCarouselButton />
      </header>

      <ImportCarouselFromArticle />

      <CarouselList
        posts={posts.map((post) => ({
          id: post.id,
          title: post.title,
          slideCount: parseSlides(post.slides).length,
          updatedAt: post.updatedAt,
          createdByName: post.createdBy.name,
          canDelete: post.createdById === session.user.id,
        }))}
      />
    </div>
  );
}
