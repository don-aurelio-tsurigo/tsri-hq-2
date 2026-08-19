"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CarouselFormatTextarea } from "@/components/carousel-format-textarea";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import { updateCarouselSlides } from "@/lib/actions";
import { exportAllCarouselSlides } from "@/lib/carousel/export";
import type { CarouselFormat } from "@/lib/carousel/format";
import { fileToCompressedDataUrl } from "@/lib/carousel/image";
import {
  DEFAULT_IMAGE_OVERLAY,
  defaultImageOverlayForSlideType,
  normalizeImageOverlay,
} from "@/lib/carousel/overlay";
import {
  createEmptySlide,
  defaultCategoryForFormat,
  lastCategory,
  themeFieldsForCategory,
} from "@/lib/carousel/slides";
import { normalizeImageTransform, normalizeTransform } from "@/lib/carousel/transform";
import {
  resolveSlideInk,
} from "@/lib/carousel/categories";
import {
  DEFAULT_BG,
  DEFAULT_IMAGE_TRANSFORM,
  DEFAULT_TRANSFORM,
  type EditableLayer,
  type ImageOverlay,
  type LayerTransform,
  type Slide,
  type SlideType,
} from "@/lib/carousel/types";

const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  cover: "Cover",
  text: "Text",
  quote: "Zitat",
  "tipp-item": "Tipp",
  outro: "Outro",
};

const ADDABLE_SLIDE_TYPES: SlideType[] = ["cover", "text", "quote", "outro"];
const SIXIBRIEF_ADDABLE_SLIDE_TYPES: SlideType[] = ["cover", "text", "outro"];

const PREVIEW_SCALE = 0.42;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type CarouselSourceArticle = {
  url: string | null;
  preTitle: string | null;
  title: string | null;
  lead: string | null;
  body: string | null;
};

function slideHasImageLayer(slide: Slide) {
  return (
    (slide.type === "cover" ||
      slide.type === "text" ||
      slide.type === "quote") &&
    Boolean(slide.backgroundImageUrl)
  );
}

function slideSupportsBackgroundImage(slide: Slide) {
  return (
    slide.type === "cover" || slide.type === "text" || slide.type === "quote"
  );
}

export function CarouselEditor({
  postId,
  initialTitle,
  initialSlides,
  createdByName,
  canEdit,
  sourceArticle = null,
  format = "standard",
}: {
  postId: string;
  initialTitle: string;
  initialSlides: Slide[];
  createdByName: string;
  canEdit: boolean;
  sourceArticle?: CarouselSourceArticle | null;
  format?: CarouselFormat;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [slides, setSlides] = useState<Slide[]>(
    initialSlides.length > 0
      ? initialSlides
      : [createEmptySlide("cover", defaultCategoryForFormat(format), format)],
  );
  const [activeId, setActiveId] = useState(slides[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<EditableLayer>("text");
  const [articleOpen, setArticleOpen] = useState(Boolean(sourceArticle));
  const [pending, startTransition] = useTransition();
  const skipFirstSave = useRef(true);
  const saveToken = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active =
    slides.find((s) => s.id === activeId) ?? slides[0] ?? null;

  const activeIndex = active
    ? slides.findIndex((s) => s.id === active.id)
    : -1;
  const disableMoveLeft = !active || activeIndex <= 0;
  const disableMoveRight =
    !active || activeIndex < 0 || activeIndex >= slides.length - 1;
  const overlayDefaults = active
    ? defaultImageOverlayForSlideType(active.type)
    : DEFAULT_IMAGE_OVERLAY;
  const imageOverlay =
    active && slideSupportsBackgroundImage(active)
      ? normalizeImageOverlay(active.imageOverlay, overlayDefaults)
      : overlayDefaults;

  useEffect(() => {
    if (!active) return;
    if (selectedLayer === "image" && !slideHasImageLayer(active)) {
      setSelectedLayer("text");
    }
  }, [active, selectedLayer]);

  useEffect(() => {
    if (!canEdit) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    setSaveState("dirty");
    const token = ++saveToken.current;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      startTransition(async () => {
        const result = await updateCarouselSlides(postId, slides, title);
        if (token !== saveToken.current) return;
        if (result?.error) {
          setError(result.error);
          setSaveState("error");
          return;
        }
        setError(null);
        setSaveState("saved");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [slides, title, postId, canEdit]);

  function updateActive(patch: Partial<Slide>) {
    if (!active || !canEdit) return;
    setSlides((prev) =>
      prev.map((s) =>
        s.id === active.id ? ({ ...s, ...patch } as Slide) : s,
      ),
    );
  }

  function updateImageOverlay(patch: Partial<ImageOverlay>) {
    if (!active || !slideSupportsBackgroundImage(active)) return;
    updateActive({
      imageOverlay: {
        ...normalizeImageOverlay(active.imageOverlay, overlayDefaults),
        ...patch,
      },
    });
  }

  function currentTransform(layer: EditableLayer): LayerTransform {
    if (!active) return { ...DEFAULT_TRANSFORM };
    if (
      layer === "image" &&
      (active.type === "cover" ||
        active.type === "text" ||
        active.type === "quote")
    ) {
      return normalizeImageTransform(active.imageTransform);
    }
    return normalizeTransform(active.textTransform);
  }

  function setLayerTransform(layer: EditableLayer, transform: LayerTransform) {
    if (!active || !canEdit) return;
    if (layer === "image") {
      if (
        active.type === "cover" ||
        active.type === "text" ||
        active.type === "quote"
      ) {
        updateActive({ imageTransform: transform });
      }
      return;
    }
    updateActive({ textTransform: transform });
  }

  function addSlide(type: SlideType) {
    if (!canEdit) return;
    const slide = createEmptySlide(type, lastCategory(slides), format);
    setSlides((prev) => [...prev, slide]);
    setActiveId(slide.id);
  }

  function removeActive() {
    if (!canEdit || !active || slides.length <= 1) return;
    const idx = slides.findIndex((s) => s.id === active.id);
    const next = slides.filter((s) => s.id !== active.id);
    setSlides(next);
    setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0]!.id);
  }

  function moveActive(delta: -1 | 1) {
    if (!canEdit || !active || slides.length <= 1) return;
    const idx = slides.findIndex((s) => s.id === active.id);
    if (idx < 0) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item!);
    setSlides(next);
  }

  async function handleExportAll() {
    setError(null);
    setExporting(true);
    setExportProgress(`0 / ${slides.length}`);
    try {
      await exportAllCarouselSlides(slides, title, (done, total) => {
        setExportProgress(`${done} / ${total}`);
      }, format);
      setExportProgress(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Export fehlgeschlagen.",
      );
      setExportProgress(null);
    } finally {
      setExporting(false);
    }
  }

  async function handleImageFile(file: File | null) {
    if (!file || !canEdit || !active) return;
    if (
      active.type !== "cover" &&
      active.type !== "text" &&
      active.type !== "quote"
    ) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      updateActive({ backgroundImageUrl: dataUrl });
      setSelectedLayer("image");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Bild-Upload fehlgeschlagen.",
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const saveLabel =
    saveState === "saving" || pending
      ? "Speichert…"
      : saveState === "saved"
        ? "Gespeichert"
        : saveState === "dirty"
          ? "Ungespeichert"
          : saveState === "error"
            ? "Fehler"
            : "";

  const transform = currentTransform(selectedLayer);
  const canEditImage = Boolean(active && slideHasImageLayer(active));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <Link
            href="/carousel"
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            ← Alle Carousels
          </Link>
          {canEdit ? (
            <input
              className="w-full max-w-xl border-0 bg-transparent font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight outline-none ring-0 placeholder:text-[var(--muted)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Arbeitstitel"
            />
          ) : (
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
              {title}
            </h1>
          )}
          <p className="text-sm text-[var(--muted)]">
            {slides.length} {slides.length === 1 ? "Slide" : "Slides"} · von{" "}
            {createdByName}
            {saveLabel ? ` · ${saveLabel}` : ""}
          </p>
          {error ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          {!canEdit ? (
            <p className="text-sm text-[var(--muted)]">
              Nur Ansicht — nur der Ersteller kann speichern.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Text/Bild im Preview ziehen · snap an Hilfslinien · Skala rechts
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary shrink-0"
          disabled={exporting || slides.length === 0}
          onClick={() => {
            void handleExportAll();
          }}
        >
          {exporting
            ? `Exportiere… ${exportProgress ?? ""}`
            : "Alle als PNG exportieren"}
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col items-center gap-4">
          {active ? (
            <CarouselSlidePreview
              slide={active}
              scale={PREVIEW_SCALE}
              interactive={canEdit}
              selectedLayer={selectedLayer}
              onSelectLayer={setSelectedLayer}
              onImageTransform={(t) => setLayerTransform("image", t)}
              onTextTransform={(t) => setLayerTransform("text", t)}
              format={format}
            />
          ) : null}

          <div className="flex w-full max-w-[460px] flex-col items-center gap-2">
            <div className="flex w-full gap-2 overflow-x-auto pb-1">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setActiveId(slide.id)}
                  className={[
                    "shrink-0 overflow-hidden rounded-lg ring-2 transition",
                    slide.id === active?.id
                      ? "ring-[var(--accent)]"
                      : "ring-transparent hover:ring-[var(--border)]",
                  ].join(" ")}
                  title={`${SLIDE_TYPE_LABEL[slide.type]} ${index + 1}`}
                >
                  <CarouselSlidePreview slide={slide} scale={0.08} format={format} />
                </button>
              ))}
            </div>

            {canEdit && slides.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1 text-sm leading-none"
                  disabled={disableMoveLeft}
                  onClick={() => moveActive(-1)}
                  title="Nach links verschieben"
                  aria-label="Nach links verschieben"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1 text-sm leading-none"
                  disabled={disableMoveRight}
                  onClick={() => moveActive(1)}
                  title="Nach rechts verschieben"
                  aria-label="Nach rechts verschieben"
                >
                  →
                </button>
              </div>
            ) : null}
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(format === "6ibrief"
                ? SIXIBRIEF_ADDABLE_SLIDE_TYPES
                : ADDABLE_SLIDE_TYPES
              ).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-sm"
                  onClick={() => addSlide(type)}
                >
                  + {SLIDE_TYPE_LABEL[type]}
                </button>
              ))}
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
                disabled={slides.length <= 1}
                onClick={removeActive}
              >
                Slide löschen
              </button>
            </div>
          ) : null}

          {sourceArticle ? (
            <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setArticleOpen((open) => !open)}
                aria-expanded={articleOpen}
              >
                <span className="text-sm font-semibold">Artikel-Original</span>
                <span className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                  {articleOpen ? "Einklappen" : "Aufklappen"}
                </span>
              </button>
              {articleOpen ? (
                <div className="space-y-4 border-t border-[var(--border)] px-4 py-4 text-sm leading-relaxed">
                  {sourceArticle.url ? (
                    <a
                      href={sourceArticle.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Artikel auf Tsüri öffnen
                    </a>
                  ) : null}
                  {sourceArticle.preTitle ? (
                    <section className="space-y-1">
                      <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                        Pre-Title
                      </p>
                      <p className="whitespace-pre-wrap">{sourceArticle.preTitle}</p>
                    </section>
                  ) : null}
                  {sourceArticle.title ? (
                    <section className="space-y-1">
                      <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                        Titel
                      </p>
                      <p className="font-[family-name:var(--font-display)] text-base font-semibold whitespace-pre-wrap">
                        {sourceArticle.title}
                      </p>
                    </section>
                  ) : null}
                  {sourceArticle.lead ? (
                    <section className="space-y-1">
                      <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                        Lead
                      </p>
                      <p className="whitespace-pre-wrap text-[var(--muted)]">
                        {sourceArticle.lead}
                      </p>
                    </section>
                  ) : null}
                  {sourceArticle.body ? (
                    <section className="space-y-1">
                      <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                        Text
                      </p>
                      <p className="max-h-[36rem] overflow-y-auto whitespace-pre-wrap">
                        {sourceArticle.body}
                      </p>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="card space-y-4 p-4">
          {active ? (
            <>
              <div>
                <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                  {SLIDE_TYPE_LABEL[active.type]}
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold">
                  Inhalt
                </h2>
              </div>

              {active.type === "cover" ? (
                <>
                  <Field label="Overline">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.overline}
                      onChange={(e) =>
                        updateActive({ overline: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Headline">
                    <textarea
                      className="min-h-28 w-full"
                      disabled={!canEdit}
                      value={active.headline}
                      onChange={(e) =>
                        updateActive({ headline: e.target.value })
                      }
                    />
                  </Field>
                </>
              ) : null}

              {active.type === "text" ? (
                <div className="field">
                  <CarouselFormatTextarea
                    label="Text"
                    disabled={!canEdit}
                    value={active.bodyHtml}
                    onChange={(bodyHtml) => updateActive({ bodyHtml })}
                    placeholder="Schon wieder ist es heiss…"
                    className="min-h-48 w-full font-mono text-sm"
                  />
                </div>
              ) : null}

              {active.type === "quote" ? (
                <>
                  <div className="field">
                    <CarouselFormatTextarea
                      label="Zitat"
                      disabled={!canEdit}
                      value={active.quoteText}
                      onChange={(quoteText) => updateActive({ quoteText })}
                      className="min-h-40 w-full font-mono text-sm"
                    />
                  </div>
                  <Field label="Attribution">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.attribution}
                      onChange={(e) =>
                        updateActive({ attribution: e.target.value })
                      }
                      placeholder="Name, Rolle"
                    />
                  </Field>
                </>
              ) : null}

              {active.type === "outro" ? (
                <>
                  <Field label="Headline">
                    <textarea
                      className="min-h-28 w-full"
                      disabled={!canEdit}
                      value={active.headline}
                      onChange={(e) =>
                        updateActive({ headline: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="CTA">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.ctaText}
                      onChange={(e) =>
                        updateActive({ ctaText: e.target.value })
                      }
                    />
                  </Field>
                </>
              ) : null}

              {canEdit ? (
                <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                  <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                    Ebene
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={[
                        "btn px-3 py-1.5 text-sm",
                        selectedLayer === "text"
                          ? "btn-primary"
                          : "btn-ghost",
                      ].join(" ")}
                      onClick={() => setSelectedLayer("text")}
                    >
                      Text
                    </button>
                    <button
                      type="button"
                      className={[
                        "btn px-3 py-1.5 text-sm",
                        selectedLayer === "image"
                          ? "btn-primary"
                          : "btn-ghost",
                      ].join(" ")}
                      disabled={!canEditImage}
                      onClick={() => setSelectedLayer("image")}
                    >
                      Bild
                    </button>
                  </div>
                  <Field label={`Skalierung (${Math.round(transform.scale * 100)}%)`}>
                    <input
                      type="range"
                      min={0.35}
                      max={2.5}
                      step={0.01}
                      value={transform.scale}
                      onChange={(e) =>
                        setLayerTransform(selectedLayer, {
                          ...transform,
                          scale: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-sm"
                    onClick={() =>
                      setLayerTransform(
                        selectedLayer,
                        selectedLayer === "image"
                          ? { ...DEFAULT_IMAGE_TRANSFORM }
                          : { ...DEFAULT_TRANSFORM },
                      )
                    }
                  >
                    Position zurücksetzen
                  </button>
                </div>
              ) : null}

              {active.type === "text" ||
              active.type === "quote" ||
              active.type === "outro" ||
              active.type === "tipp-item" ? (
                <Field label="Textfarbe">
                  <div className="flex gap-2">
                    {(
                      [
                        ["light", "Weiss"],
                        ["dark", "Schwarz"],
                      ] as const
                    ).map(([value, label]) => {
                      const current = resolveSlideInk(active);
                      const selected = current === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          disabled={!canEdit}
                          className={[
                            "btn px-3 py-1.5 text-sm",
                            selected ? "btn-primary" : "btn-ghost",
                          ].join(" ")}
                          onClick={() => updateActive({ ink: value })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : null}

              {slideSupportsBackgroundImage(active) ? (
                <Field label="Hintergrundbild">
                  <div className="space-y-2">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={
                        active.backgroundImageUrl?.startsWith("data:")
                          ? "(hochgeladenes Bild)"
                          : (active.backgroundImageUrl ?? "")
                      }
                      onChange={(e) => {
                        if (e.target.value === "(hochgeladenes Bild)") return;
                        updateActive({
                          backgroundImageUrl: e.target.value.trim() || null,
                        });
                      }}
                      placeholder="https://… oder Datei wählen"
                    />
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            void handleImageFile(e.target.files?.[0] ?? null);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost px-3 py-1.5 text-sm"
                          disabled={uploading}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {uploading ? "Lädt…" : "Bild hochladen"}
                        </button>
                        {active.backgroundImageUrl ? (
                          <button
                            type="button"
                            className="btn btn-ghost px-3 py-1.5 text-sm text-[var(--danger)]"
                            onClick={() =>
                              updateActive({ backgroundImageUrl: null })
                            }
                          >
                            Bild entfernen
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Field>
              ) : null}

              {slideSupportsBackgroundImage(active) &&
              active.backgroundImageUrl ? (
                <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
                  <p className="text-sm font-medium">Bild-Abdunklung</p>
                  <Field
                    label={`Bild abdunkeln (${Math.round(imageOverlay.dim * 100)}%)`}
                  >
                    <input
                      type="range"
                      className="w-full"
                      disabled={!canEdit}
                      min={0}
                      max={1}
                      step={0.01}
                      value={imageOverlay.dim}
                      onChange={(e) =>
                        updateImageOverlay({ dim: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field
                    label={`Verlauf Stärke (${Math.round(imageOverlay.gradientStrength * 100)}%)`}
                  >
                    <input
                      type="range"
                      className="w-full"
                      disabled={!canEdit}
                      min={0}
                      max={1}
                      step={0.01}
                      value={imageOverlay.gradientStrength}
                      onChange={(e) =>
                        updateImageOverlay({
                          gradientStrength: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={`Verlauf Höhe (${Math.round(imageOverlay.gradientLift * 100)}%)`}
                  >
                    <input
                      type="range"
                      className="w-full"
                      disabled={!canEdit}
                      min={0}
                      max={1}
                      step={0.01}
                      value={imageOverlay.gradientLift}
                      onChange={(e) =>
                        updateImageOverlay({
                          gradientLift: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={Boolean(imageOverlay.gradientFromTop)}
                      onChange={(e) =>
                        updateImageOverlay({
                          gradientFromTop: e.target.checked,
                        })
                      }
                    />
                    Verlauf von oben
                  </label>
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-1.5 text-sm"
                      onClick={() =>
                        updateActive({
                          imageOverlay: defaultImageOverlayForSlideType(
                            active.type,
                          ),
                        })
                      }
                    >
                      Abdunklung zurücksetzen
                    </button>
                  ) : null}
                </div>
              ) : null}

              <Field label="Kategorie">
                <input
                  className="w-full"
                  disabled={!canEdit}
                  value={active.category}
                  onChange={(e) => {
                    const category = e.target.value;
                    if (
                      format !== "6ibrief" &&
                      (active.type === "text" ||
                        active.type === "quote" ||
                        active.type === "outro" ||
                        active.type === "tipp-item")
                    ) {
                      updateActive({
                        category,
                        ...themeFieldsForCategory(category),
                      });
                    } else {
                      updateActive({ category });
                    }
                  }}
                />
              </Field>

              {active.type === "text" ||
              active.type === "quote" ||
              active.type === "outro" ||
              active.type === "tipp-item" ? (
                <Field label="Hintergrundfarbe">
                  <div className="flex gap-2">
                    <input
                      type="color"
                      className="h-10 w-12 cursor-pointer rounded border border-[var(--border)] bg-white p-1"
                      disabled={!canEdit}
                      value={active.backgroundColor || DEFAULT_BG}
                      onChange={(e) =>
                        updateActive({ backgroundColor: e.target.value })
                      }
                    />
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.backgroundColor}
                      onChange={(e) =>
                        updateActive({ backgroundColor: e.target.value })
                      }
                    />
                  </div>
                </Field>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Kein Slide gewählt.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
