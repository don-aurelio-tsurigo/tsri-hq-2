"use client";

import { useState, useTransition } from "react";
import { CarouselFormatSelector } from "@/components/carousel-format-selector";
import {
  createCarouselPost,
  importCarouselFromArticleUrl,
  importCarouselFromPastedText,
} from "@/lib/actions";
import {
  CAROUSEL_FORMAT_LABELS,
  type CarouselFormat,
} from "@/lib/carousel/format";

type StartMode = "article" | "paste" | "empty";

const MIN_PASTE_CHARS = 80;

function defaultStartMode(format: CarouselFormat): StartMode {
  return format === "6ibrief" ? "paste" : "article";
}

export function CarouselCreatePanel() {
  const [format, setFormat] = useState<CarouselFormat>("standard");
  const [startMode, setStartMode] = useState<StartMode>("article");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [importing, startImport] = useTransition();
  const pending = creating || importing;
  const pasteReady = pastedText.trim().length >= MIN_PASTE_CHARS;

  function handleFormatChange(next: CarouselFormat) {
    setFormat(next);
    setError(null);
    setStartMode(defaultStartMode(next));
  }

  function runImport() {
    if (!url.trim() || pending) return;
    setError(null);
    startImport(async () => {
      const result = await importCarouselFromArticleUrl(url, format);
      if (result?.error) setError(result.error);
    });
  }

  function runPasteImport() {
    if (!pasteReady || pending) return;
    setError(null);
    startImport(async () => {
      const result = await importCarouselFromPastedText(pastedText, format);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
      <CarouselFormatSelector
        value={format}
        onChange={handleFormatChange}
        disabled={pending}
      />

      <fieldset className="space-y-3" disabled={pending}>
        <legend className="text-sm font-semibold text-[var(--ink)]">
          2. So starten
        </legend>

        <div className="grid gap-3 sm:grid-cols-3">
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
              startMode === "paste"
                ? "border-[var(--accent)] bg-[var(--accent-soft)]/40"
                : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--accent)]/40",
              pending ? "cursor-not-allowed opacity-60" : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="carousel-start-mode"
                value="paste"
                checked={startMode === "paste"}
                onChange={() => {
                  setStartMode("paste");
                  setError(null);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold">Text einfügen</span>
            </div>
            <p className="pl-6 text-xs leading-relaxed text-[var(--muted)]">
              {format === "6ibrief"
                ? "6iBrief-Text einfügen — wird mit dem 6iBrief-Prompt aufbereitet."
                : "Text einfügen — wird im gewählten Format aufbereitet."}
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
        ) : startMode === "paste" ? (
          <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <p className="text-xs font-medium text-[var(--muted)]">
              Text für Format «{CAROUSEL_FORMAT_LABELS[format]}» einfügen
            </p>
            <textarea
              className="min-h-40 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm leading-relaxed"
              placeholder={
                format === "6ibrief"
                  ? "6iBrief-Text hier einfügen…"
                  : "Text hier einfügen…"
              }
              disabled={pending}
              value={pastedText}
              onChange={(e) => {
                setPastedText(e.target.value);
                if (error) setError(null);
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--muted)]">
                {pastedText.trim().length} Zeichen
                {!pasteReady
                  ? ` (min. ${MIN_PASTE_CHARS})`
                  : ""}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !pasteReady}
                onClick={runPasteImport}
              >
                {importing ? "Wird erzeugt…" : "Carousel erzeugen"}
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
