"use client";

import { useState, useTransition } from "react";
import { CarouselFormatSelector } from "@/components/carousel-format-selector";
import {
  createCarouselPost,
  importCarouselFromArticleUrl,
} from "@/lib/actions";
import {
  CAROUSEL_FORMAT_LABELS,
  type CarouselFormat,
} from "@/lib/carousel/format";

type StartMode = "article" | "empty";

export function CarouselCreatePanel() {
  const [format, setFormat] = useState<CarouselFormat>("standard");
  const [startMode, setStartMode] = useState<StartMode>("article");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [importing, startImport] = useTransition();
  const pending = creating || importing;

  function runImport() {
    if (!url.trim() || pending) return;
    setError(null);
    startImport(async () => {
      const result = await importCarouselFromArticleUrl(url, format);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
      <CarouselFormatSelector
        value={format}
        onChange={setFormat}
        disabled={pending}
      />

      <fieldset className="space-y-3" disabled={pending}>
        <legend className="text-sm font-semibold text-[var(--ink)]">
          2. So starten
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={[
              "flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 transition",
              startMode === "article"
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/40",
              pending ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="carousel-start-mode"
                value="article"
                checked={startMode === "article"}
                onChange={() => {
                  setStartMode("article");
                  setError(null);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold">Aus Artikel</span>
            </div>
            <p className="pl-6 text-xs leading-relaxed text-[var(--muted)]">
              Tsüri-URL einfügen — Text wird geladen und im gewählten Format
              aufbereitet.
            </p>
          </label>

          <label
            className={[
              "flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-4 transition",
              startMode === "empty"
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/40",
              pending ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="carousel-start-mode"
                value="empty"
                checked={startMode === "empty"}
                onChange={() => {
                  setStartMode("empty");
                  setError(null);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold">Leeres Carousel</span>
            </div>
            <p className="pl-6 text-xs leading-relaxed text-[var(--muted)]">
              Mit Cover starten und Inhalt selbst schreiben — Format bleibt
              ausgewählt.
            </p>
          </label>
        </div>

        {startMode === "article" ? (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <p className="text-xs font-medium text-[var(--muted)]">
              Artikel-URL für Format «{CAROUSEL_FORMAT_LABELS[format]}»
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
                    runImport();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !url.trim()}
                onClick={runImport}
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
        ) : (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <button
              type="button"
              className="btn btn-primary"
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
        )}
      </fieldset>
    </div>
  );
}
