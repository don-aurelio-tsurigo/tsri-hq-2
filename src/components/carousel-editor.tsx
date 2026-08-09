"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import { updateCarouselSlides } from "@/lib/actions";
import { exportAllCarouselSlides } from "@/lib/carousel/export";
import { fileToCompressedDataUrl } from "@/lib/carousel/image";
import {
  createEmptySlide,
  lastCategory,
} from "@/lib/carousel/slides";
import { normalizeTransform } from "@/lib/carousel/transform";
import {
  DEFAULT_BG,
  DEFAULT_TRANSFORM,
  type EditableLayer,
  type LayerTransform,
  type Slide,
  type SlideType,
} from "@/lib/carousel/types";

const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  cover: "Cover",
  text: "Text",
  quote: "Zitat",
  outro: "Outro",
};

const PREVIEW_SCALE = 0.42;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function slideHasImageLayer(slide: Slide) {
  return (
    (slide.type === "cover" || slide.type === "quote") &&
    Boolean(slide.backgroundImageUrl)
  );
}

export function CarouselEditor({
  postId,
  initialTitle,
  initialSlides,
  createdByName,
  canEdit,
}: {
  postId: string;
  initialTitle: string;
  initialSlides: Slide[];
  createdByName: string;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [slides, setSlides] = useState<Slide[]>(
    initialSlides.length > 0 ? initialSlides : [createEmptySlide("cover")],
  );
  const [activeId, setActiveId] = useState(slides[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<EditableLayer>("text");
  const [pending, startTransition] = useTransition();
  const skipFirstSave = useRef(true);
  const saveToken = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active =
    slides.find((s) => s.id === activeId) ?? slides[0] ?? null;

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

  function currentTransform(layer: EditableLayer): LayerTransform {
    if (!active) return { ...DEFAULT_TRANSFORM };
    if (layer === "image" && (active.type === "cover" || active.type === "quote")) {
      return normalizeTransform(active.imageTransform);
    }
    return normalizeTransform(active.textTransform);
  }

  function setLayerTransform(layer: EditableLayer, transform: LayerTransform) {
    if (!active || !canEdit) return;
    if (layer === "image") {
      if (active.type === "cover" || active.type === "quote") {
        updateActive({ imageTransform: transform });
      }
      return;
    }
    updateActive({ textTransform: transform });
  }

  function addSlide(type: SlideType) {
    if (!canEdit) return;
    const slide = createEmptySlide(type, lastCategory(slides));
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

  async function handleExportAll() {
    setError(null);
    setExporting(true);
    setExportProgress(`0 / ${slides.length}`);
    try {
      await exportAllCarouselSlides(slides, title, (done, total) => {
        setExportProgress(`${done} / ${total}`);
      });
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
    if (active.type !== "cover" && active.type !== "quote") return;
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
            />
          ) : null}

          <div className="flex w-full max-w-[460px] gap-2 overflow-x-auto pb-1">
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
                <CarouselSlidePreview slide={slide} scale={0.08} />
              </button>
            ))}
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(Object.keys(SLIDE_TYPE_LABEL) as SlideType[]).map((type) => (
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
                      setLayerTransform(selectedLayer, {
                        ...DEFAULT_TRANSFORM,
                      })
                    }
                  >
                    Position zurücksetzen
                  </button>
                </div>
              ) : null}

              <Field label="Kategorie">
                <input
                  className="w-full"
                  disabled={!canEdit}
                  value={active.category}
                  onChange={(e) => updateActive({ category: e.target.value })}
                />
              </Field>

              {active.type === "cover" || active.type === "quote" ? (
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
                <>
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
                  <Field label="Text (Zeilenumbruch ok, <b>fett</b>)">
                    <textarea
                      className="min-h-48 w-full font-mono text-sm"
                      disabled={!canEdit}
                      value={active.bodyHtml}
                      onChange={(e) =>
                        updateActive({ bodyHtml: e.target.value })
                      }
                      placeholder="Schon wieder ist es heiss…"
                    />
                  </Field>
                </>
              ) : null}

              {active.type === "quote" ? (
                <>
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
                  <Field label="Zitat">
                    <textarea
                      className="min-h-40 w-full"
                      disabled={!canEdit}
                      value={active.quoteText}
                      onChange={(e) =>
                        updateActive({ quoteText: e.target.value })
                      }
                    />
                  </Field>
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
