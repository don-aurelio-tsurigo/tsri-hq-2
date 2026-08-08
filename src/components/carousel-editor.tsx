"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import { updateCarouselSlides } from "@/lib/actions";
import {
  createEmptySlide,
  lastCategory,
} from "@/lib/carousel/slides";
import {
  DEFAULT_BG,
  type Slide,
  type SlideType,
} from "@/lib/carousel/types";

const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  cover: "Cover",
  text: "Text",
  quote: "Zitat",
  outro: "Outro",
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

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
  const [pending, startTransition] = useTransition();
  const skipFirstSave = useRef(true);
  const saveToken = useRef(0);

  const active =
    slides.find((s) => s.id === activeId) ?? slides[0] ?? null;

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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
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
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col items-center gap-4">
          {active ? (
            <CarouselSlidePreview slide={active} scale={0.42} />
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

              <Field label="Kategorie">
                <input
                  className="w-full"
                  disabled={!canEdit}
                  value={active.category}
                  onChange={(e) => updateActive({ category: e.target.value })}
                />
              </Field>

              {active.type === "cover" ? (
                <>
                  <Field label="Hintergrundbild (URL)">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.backgroundImageUrl ?? ""}
                      onChange={(e) =>
                        updateActive({
                          backgroundImageUrl: e.target.value.trim() || null,
                        })
                      }
                      placeholder="https://…"
                    />
                  </Field>
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
                  <Field label="Hintergrundbild (URL, optional)">
                    <input
                      className="w-full"
                      disabled={!canEdit}
                      value={active.backgroundImageUrl ?? ""}
                      onChange={(e) =>
                        updateActive({
                          backgroundImageUrl: e.target.value.trim() || null,
                        })
                      }
                      placeholder="leer = Vollfläche"
                    />
                  </Field>
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
