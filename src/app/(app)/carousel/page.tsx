import { CarouselCreatePanel } from "@/components/carousel-create-panel";
import { CarouselList } from "@/components/carousel-list";
import { listCarouselPosts, parseSlides } from "@/lib/carousel";
import { isAdmin } from "@/lib/permissions";
import { requireMembership } from "@/lib/session";

export default async function CarouselIndexPage() {
  const { session, membership } = await requireMembership();
  const posts = await listCarouselPosts();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
          Redaktion
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Instagram Carousel
        </h1>
      </header>

      <CarouselCreatePanel />

      <CarouselList
        posts={posts.map((post) => ({
          id: post.id,
          title: post.title,
          slideCount: parseSlides(post.slides).length,
          updatedAt: post.updatedAt,
          createdByName: post.createdBy.name,
          canDelete:
            post.createdById === session.user.id || isAdmin(membership.role),
        }))}
      />
    </div>
  );
}
