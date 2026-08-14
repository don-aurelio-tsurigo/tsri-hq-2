"use client";

import { useState, useTransition } from "react";
import { CarouselFormatSelector } from "@/components/carousel-format-selector";
import {
  createCarouselPost,
  importCarouselFromArticleUrl,
} from "@/lib/actions";
import type { CarouselFormat } from "@/lib/carousel/format";

export function CarouselCreatePanel() {
  const [format, setFormat] = useState<CarouselFormat>("standard");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [importing, startImport] = useTransition();
  const pending = creating || importing;

  return (
    <div className="space-y-4">
      <CarouselFormatSelector
        value={format}
        onChange={setFormat}
        disabled={pending}
      />

      <div className="w-full max-w-xl space-y-2 rounded-md border border-[var(--border)] p-3">
        <p className="text-sm font-medium">Aus Artikel</p>
        <p className="text-xs text-[var(--muted)]">
          Tsüri-URL einfügen — Text wird geladen und als Carousel aufbereitet.
          Das gewählte Format steuert die Slide-Struktur.
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
                startImport(async () => {
                  const result = await importCarouselFromArticleUrl(url, format);
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
              startImport(async () => {
                const result = await importCarouselFromArticleUrl(url, format);
                if (result?.error) setError(result.error);
              });
            }}
          >
            {importing ? "Wird erzeugt…" : "Importieren"}
          </button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        onClick={() => {
          startCreate(() => {
            void createCarouselPost(undefined, format);
          });
        }}
      >
        {creating ? "Wird erstellt…" : "Leeres Carousel erstellen"}
      </button>
    </div>
  );
}
