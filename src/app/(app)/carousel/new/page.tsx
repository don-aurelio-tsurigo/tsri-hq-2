import { createCarouselPost } from "@/lib/actions";

/** Fallback-Route: Form-Action statt Mutation während RSC-Render. */
export default function NewCarouselPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-16 text-center">
      <p className="text-[var(--muted)]">Neues Carousel wird angelegt…</p>
      <form action={createCarouselPost}>
        <button type="submit" className="btn btn-primary">
          Weiter
        </button>
      </form>
    </div>
  );
}
