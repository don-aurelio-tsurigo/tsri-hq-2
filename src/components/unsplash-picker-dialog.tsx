"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { UnsplashPickerPhoto } from "@/lib/unsplash";

const DEBOUNCE_MS = 400;

type SearchResponse = {
  photos?: UnsplashPickerPhoto[];
  page?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

export function UnsplashPickerDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}) {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<UnsplashPickerPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(queryInput.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPhotos([]);
    setPage(1);

    void (async () => {
      try {
        const params = new URLSearchParams({ q: query, page: "1" });
        const res = await fetch(`/api/unsplash/search?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as SearchResponse;
        if (!res.ok) {
          throw new Error(data.error || "Suche fehlgeschlagen.");
        }
        setPhotos(data.photos ?? []);
        setPage(data.page ?? 1);
        setPageCount(data.pageCount ?? 0);
        setTotal(data.total ?? 0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [query]);

  async function loadMore() {
    if (loadingMore || page >= pageCount) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const params = new URLSearchParams({ q: query, page: String(nextPage) });
      const res = await fetch(`/api/unsplash/search?${params}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) {
        throw new Error(data.error || "Suche fehlgeschlagen.");
      }
      const nextPhotos = data.photos ?? [];
      setPhotos((prev) => {
        const seen = new Set(prev.map((photo) => photo.id));
        return [...prev, ...nextPhotos.filter((photo) => !seen.has(photo.id))];
      });
      setPage(data.page ?? nextPage);
      setPageCount(data.pageCount ?? pageCount);
      setTotal(data.total ?? total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function selectPhoto(photo: UnsplashPickerPhoto) {
    if (selectingId) return;
    setSelectingId(photo.id);
    setError(null);
    try {
      const res = await fetch("/api/unsplash/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadLocation: photo.downloadLocation,
          imageUrl: photo.imageUrl,
        }),
      });
      const data = (await res.json()) as { imageUrl?: string; error?: string };
      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error || "Bild konnte nicht übernommen werden.");
      }
      onSelect(data.imageUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Bild konnte nicht übernommen werden.",
      );
      setSelectingId(null);
    }
  }

  const hasMore = page < pageCount;
  const busy = Boolean(selectingId);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsplash-picker-title"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[min(36rem,85vh)] w-full max-w-2xl flex-col overflow-hidden p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="unsplash-picker-title"
              className="font-[family-name:var(--font-display)] text-xl font-semibold"
            >
              Von Unsplash
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Foto wählen, um es ins Carousel einzufügen. Credit dem Fotografen
              nicht vergessen.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label="Schliessen"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="field mt-3">
          <label htmlFor="unsplash-picker-q">Suche</label>
          <input
            ref={searchRef}
            id="unsplash-picker-q"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="z.B. Zürich, Hochhaus, See…"
            autoComplete="off"
            disabled={busy}
          />
        </div>

        {error ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>
        ) : null}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              Lädt…
            </p>
          ) : photos.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              Keine Fotos gefunden.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((photo) => (
                <li key={photo.id}>
                  <button
                    type="button"
                    className="card w-full cursor-pointer overflow-hidden p-0 text-left hover:ring-2 hover:ring-[var(--fg)] disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void selectPhoto(photo)}
                  >
                    <div className="flex aspect-[3/4] items-center justify-center bg-[var(--panel-muted)] p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbUrl}
                        alt={photo.altText || photo.photographerName}
                        loading="lazy"
                        decoding="async"
                        className="max-h-full max-w-full object-cover"
                      />
                    </div>
                    <div className="space-y-0.5 px-2 py-1.5">
                      <p className="truncate text-xs font-semibold">
                        {selectingId === photo.id
                          ? "Wird übernommen…"
                          : photo.photographerName}
                      </p>
                      <p className="truncate text-[0.65rem] text-[var(--muted)]">
                        Unsplash
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && photos.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">
              {query
                ? total === 1
                  ? "1 Treffer"
                  : `${total} Treffer`
                : "Aktuelle Unsplash-Fotos"}
            </p>
            {hasMore ? (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm"
                disabled={loadingMore || busy}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Lädt…" : "Mehr laden"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
