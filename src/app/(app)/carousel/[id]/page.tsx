import Link from "next/link";
import { notFound } from "next/navigation";
import { getCarouselPost, parseSlides } from "@/lib/carousel";
import { requireMembership } from "@/lib/session";

export default async function CarouselEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireMembership();
  const { id } = await params;
  const post = await getCarouselPost(id);
  if (!post) notFound();

  const slides = parseSlides(post.slides);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        <Link
          href="/carousel"
          className="text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          ← Alle Carousels
        </Link>
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--accent)] uppercase">
            Carousel-Editor
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {post.title}
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            {slides.length} {slides.length === 1 ? "Slide" : "Slides"} · von{" "}
            {post.createdBy.name}
          </p>
        </div>
      </header>

      <div className="card space-y-2 px-4 py-6">
        <p className="font-semibold">Editor folgt in Schritt 3</p>
        <p className="text-sm text-[var(--muted)]">
          Hier kommt die Konva-Oberfläche (Templates, Text/Bild, PNG-Export).
          Die Grundnavigation und Persistenz sind bereit.
        </p>
        <ul className="mt-4 list-inside list-disc text-sm text-[var(--muted)]">
          {slides.map((slide, index) => (
            <li key={slide.id}>
              Slide {index + 1}: {slide.type}
              {slide.category ? ` · ${slide.category}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
