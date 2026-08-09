"use client";

import { useState, useTransition } from "react";
import { importCarouselFromArticleUrl } from "@/lib/actions";

export function ImportCarouselFromArticle() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="w-full max-w-xl space-y-2 rounded-md border border-[var(--border)] p-3">
      <p className="text-sm font-medium">Aus Artikel</p>
      <p className="text-xs text-[var(--muted)]">
        Tsüri-URL einfügen — Text wird geladen und als Carousel aufbereitet.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[16rem] flex-1"
          type="url"
          placeholder="https://tsri.ch/a/…"
          disabled={pending}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!url.trim() || pending) return;
              setError(null);
              startTransition(async () => {
                const result = await importCarouselFromArticleUrl(url);
                if (result?.error) setError(result.error);
              });
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !url.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await importCarouselFromArticleUrl(url);
              if (result?.error) setError(result.error);
            });
          }}
        >
          {pending ? "Wird erzeugt…" : "Importieren"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
