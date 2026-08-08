"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { deleteCarouselPost } from "@/lib/actions";

export type CarouselListItem = {
  id: string;
  title: string;
  slideCount: number;
  updatedAt: Date | string;
  createdByName: string;
  canDelete: boolean;
};

export function CarouselList({ posts }: { posts: CarouselListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (posts.length === 0) {
    return (
      <div className="card px-4 py-8 text-center text-sm text-[var(--muted)]">
        Noch keine Carousels. Lege mit „Neu erstellen“ das erste an.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        {posts.map((post) => {
          const updated =
            typeof post.updatedAt === "string"
              ? new Date(post.updatedAt)
              : post.updatedAt;
          return (
            <li
              key={post.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <Link
                href={`/carousel/${post.id}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <p className="truncate font-semibold text-[var(--fg)]">
                  {post.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {post.slideCount}{" "}
                  {post.slideCount === 1 ? "Slide" : "Slides"} ·{" "}
                  {post.createdByName} ·{" "}
                  {format(updated, "dd.MM.yyyy HH:mm", { locale: de })}
                </p>
              </Link>
              {post.canDelete ? (
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`«${post.title}» wirklich löschen?`)) return;
                    setError(null);
                    startTransition(async () => {
                      const fd = new FormData();
                      fd.set("id", post.id);
                      const result = await deleteCarouselPost(fd);
                      if (result?.error) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  Löschen
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
