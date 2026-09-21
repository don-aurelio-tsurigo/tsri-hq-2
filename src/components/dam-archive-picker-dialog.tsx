"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { damFileSrc, type DamEditParams } from "@/lib/dam/edit-params";

const DEBOUNCE_MS = 350;

export type DamArchivePickerAsset = {
  id: string;
  fileName: string;
  credit: string;
  altText: string | null;
  editParams: DamEditParams;
};

type SearchResponse = {
  assets?: DamArchivePickerAsset[];
  page?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

export function DamArchivePickerDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}) {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<DamArchivePickerAsset[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
    setAssets([]);
    setPage(1);

    void (async () => {
      try {
        const params = new URLSearchParams({ q: query, page: "1" });
        const res = await fetch(`/api/dam/archive/search?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as SearchResponse;
        if (!res.ok) {
          throw new Error(data.error || "Suche fehlgeschlagen.");
        }
        setAssets(data.assets ?? []);
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
      const res = await fetch(`/api/dam/archive/search?${params}`);
      const data = (await res.json()) as SearchResponse;
      if (!res.ok) {
        throw new Error(data.error || "Suche fehlgeschlagen.");
      }
      const nextAssets = data.assets ?? [];
      setAssets((prev) => {
        const seen = new Set(prev.map((asset) => asset.id));
        return [...prev, ...nextAssets.filter((asset) => !seen.has(asset.id))];
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

  function selectAsset(asset: DamArchivePickerAsset) {
    onSelect(damFileSrc(asset.id, "web", asset.editParams));
  }

  const hasMore = page < pageCount;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dam-archive-picker-title"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[min(36rem,85vh)] w-full max-w-2xl flex-col overflow-hidden p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="dam-archive-picker-title"
              className="font-[family-name:var(--font-display)] text-xl font-semibold"
            >
              Aus der Mediathek
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Foto wählen, um es ins Carousel einzufügen.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label="Schliessen"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="field mt-3">
          <label htmlFor="dam-archive-picker-q">Suche</label>
          <input
            ref={searchRef}
            id="dam-archive-picker-q"
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Dateiname, Keywords, Alt-Text, Credit…"
            autoComplete="off"
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
          ) : assets.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              {query
                ? "Keine Fotos gefunden."
                : "Noch keine publizierten Bilder in der Mediathek."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="card w-full cursor-pointer overflow-hidden p-0 text-left hover:ring-2 hover:ring-[var(--fg)]"
                    onClick={() => selectAsset(asset)}
                  >
                    <div className="flex aspect-[4/3] items-center justify-center bg-[var(--panel-muted)] p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={damFileSrc(asset.id, "thumb", asset.editParams)}
                        alt={asset.altText || asset.fileName}
                        loading="lazy"
                        decoding="async"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div className="space-y-0.5 px-2 py-1.5">
                      <p className="truncate text-xs font-semibold">
                        {asset.fileName}
                      </p>
                      {asset.credit ? (
                        <p className="truncate text-[0.65rem] text-[var(--muted)]">
                          {asset.credit}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && assets.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--muted)]">
              {total === 1 ? "1 Foto" : `${total} Fotos`}
            </p>
            {hasMore ? (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm"
                disabled={loadingMore}
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
