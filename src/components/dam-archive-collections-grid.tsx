"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { archiveCollectionHref } from "@/lib/dam/archive-filters";
import { damFileSrc } from "@/lib/dam/edit-params";
import type { ArchiveCollectionCard } from "@/lib/dam/archive-search";

export function DamArchiveCollectionsGrid({
  collections,
}: {
  collections: ArchiveCollectionCard[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={archiveCollectionHref(collection.id)}
          className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-[var(--panel-muted)] shadow-sm ring-1 ring-[var(--border)] transition hover:ring-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {collection.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={damFileSrc(
                collection.preview.id,
                "thumb",
                collection.preview.editParams,
              )}
              alt=""
              className="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--panel-muted)] text-[var(--muted)]">
              <LayoutGrid className="size-10 opacity-40" aria-hidden />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 via-black/45 to-transparent px-3 pb-8 pt-2.5">
            <p className="flex items-start gap-2 text-sm font-semibold leading-snug text-white">
              <LayoutGrid
                className="mt-0.5 size-4 shrink-0 opacity-90"
                aria-hidden
              />
              <span className="line-clamp-2">{collection.name}</span>
            </p>
          </div>
          <span className="sr-only">
            {collection.assetCount}{" "}
            {collection.assetCount === 1 ? "Bild" : "Bilder"}
          </span>
        </Link>
      ))}
    </div>
  );
}
