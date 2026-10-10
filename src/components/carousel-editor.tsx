"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  Archive,
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Lock,
  Type,
  ImagePlus,
  LoaderCircle,
  Redo2,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import { DamArchivePickerDialog } from "@/components/dam-archive-picker-dialog";
import { UnsplashPickerDialog } from "@/components/unsplash-picker-dialog";
import { updateCarouselSlides } from "@/lib/actions";
import { exportAllCarouselSlides } from "@/lib/carousel/export";
import type { CarouselFormat } from "@/lib/carousel/format";
import { isQuoteCascadeFormat } from "@/lib/carousel/format";
import {
  fileToCompressedDataUrl,
  probeImageSize,
  probeImageSizeAnyOrigin,
} from "@/lib/carousel/image";
import {
  DEFAULT_IMAGE_OVERLAY,
  defaultImageOverlayForSlideType,
  normalizeImageOverlay,
} from "@/lib/carousel/overlay";
import {
  createEmptySlide,
  defaultCategoryForFormat,
  duplicateSlide,
  lastCategory,
  themeFieldsForCategory,
} from "@/lib/carousel/slides";
import {
  defaultImageTransformForSize,
  fillImageTransformForSize,
  fitImageTransform,
  normalizeImageCrop,
  normalizeImageTransform,
  normalizeTransform,
} from "@/lib/carousel/transform";
import {
  resolveSlideInk,
} from "@/lib/carousel/categories";
import {
  CANVAS_WIDTH,
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
  frage: "Frage",
  "tipp-item": "Tipp",
  outro: "Outro",
};

const ADDABLE_SLIDE_TYPES: SlideType[] = [
  "cover",
  "text",
  "quote",
  "frage",
  "outro",
];
const QUOTE_CASCADE_ADDABLE_SLIDE_TYPES: SlideType[] = [
  "cover",
  "text",
  "quote",
  "frage",
  "outro",
];
const SIXIBRIEF_ADDABLE_SLIDE_TYPES: SlideType[] = ["cover", "text", "outro"];

const PREVIEW_SCALE = 0.42;

/** Thumbnail strip: fit all slides in one row between these scales. */
const THUMB_GAP = 8;
const THUMB_MIN_SCALE = 0.05;
const THUMB_MAX_SCALE = 0.1;
const THUMB_FALLBACK_SCALE = 0.08;

/** Changes closer together than this become one undo step (drags, typing). */
const HISTORY_GROUP_MS = 600;
const HISTORY_LIMIT = 100;

/** Wall-clock ms; only called from event handlers. */
function historyNow() {
  return Date.now();
}

/** Image URL from a drag out of another web page (prefers the <img> src). */
function droppedImageUrl(data: DataTransfer): string | null {
  const html = data.getData("text/html");
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const src = match?.[1]?.replace(/&amp;/g, "&");
    if (src && /^(https?:|data:image\/)/i.test(src)) return src;
  }
  const uri = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  return uri && /^https?:/i.test(uri) ? uri.trim() : null;
}

/** Only outside files / web images — not our own thumbnail drags. */
function isExternalImageDrag(data: DataTransfer): boolean {
  const types = Array.from(data.types);
  return types.includes("Files") || types.includes("text/uri-list");
}

/** Short plain-text hint of a slide's text layer for the layer list. */
function textLayerHint(slide: Slide): string {
  const raw =
    slide.type === "cover" || slide.type === "outro"
      ? slide.headline
      : slide.type === "text"
        ? slide.bodyHtml
        : slide.type === "quote"
          ? slide.quoteText
          : slide.type === "frage"
            ? slide.questionText
            : (slide.items[0]?.title ?? "");
  const plain = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 32 ? `${plain.slice(0, 32)}…` : plain;
}

const COMPACT_QUERY = "(max-width: 767px)";

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Phones: view only (touch scrolling would fight with dragging layers). */
function useCompactLayout() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

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
      slide.type === "quote" ||
      slide.type === "frage") &&
    Boolean(slide.backgroundImageUrl)
  );
}

function slideSupportsBackgroundImage(slide: Slide) {
  return (
    slide.type === "cover" ||
    slide.type === "text" ||
    slide.type === "quote" ||
    slide.type === "frage"
  );
}

function backgroundImageInputValue(url: string | null): string {
  if (!url) return "";
  if (url.startsWith("data:")) return "(hochgeladen)";
  if (url.startsWith("/api/dam/")) return "(Mediathek)";
  if (url.includes("images.unsplash.com")) return "(Unsplash)";
  return url;
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
  const [archivePickerOpen, setArchivePickerOpen] = useState(false);
  const [unsplashPickerOpen, setUnsplashPickerOpen] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<EditableLayer>("text");
  const [articleOpen, setArticleOpen] = useState(Boolean(sourceArticle));
  const [dragSlideId, setDragSlideId] = useState<string | null>(null);
  /** Insertion index (0…slides.length) while a thumbnail is dragged. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** Distance between two thumbnails, measured when a drag starts. */
  const [dragStep, setDragStep] = useState(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  /** Thumbnail centers (strip content coordinates) at drag start. */
  const thumbCentersRef = useRef<number[]>([]);
  const [thumbStripWidth, setThumbStripWidth] = useState(0);
  const previewColumnRef = useRef<HTMLDivElement>(null);
  const [previewColumnWidth, setPreviewColumnWidth] = useState(0);
  const compact = useCompactLayout();
  /** An image file/URL is dragged over the large preview. */
  const [imageDragOver, setImageDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const skipFirstSave = useRef(true);
  const saveToken = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slidesRef = useRef(slides);
  const historyRef = useRef<{
    past: Slide[][];
    future: Slide[][];
    lastAt: number;
  }>({ past: [], future: [], lastAt: 0 });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const shortcutRef = useRef<{ undo: () => void; redo: () => void }>({
    undo: () => {},
    redo: () => {},
  });

  const active =
    slides.find((s) => s.id === activeId) ?? slides[0] ?? null;

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

  useLayoutEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    const column = previewColumnRef.current;
    if (!column) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setPreviewColumnWidth(entry.contentRect.width);
    });
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  // Large preview shrinks to fit narrow screens (never wider than the column).
  const previewScale = previewColumnWidth
    ? Math.min(PREVIEW_SCALE, previewColumnWidth / CANVAS_WIDTH)
    : PREVIEW_SCALE;
  const canEditCanvas = canEdit && !compact;

  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setThumbStripWidth(entry.contentRect.width);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  // All thumbnails in one row across the full width (scrolls only if very many).
  const thumbScale = thumbStripWidth
    ? Math.min(
        THUMB_MAX_SCALE,
        Math.max(
          THUMB_MIN_SCALE,
          (thumbStripWidth - THUMB_GAP * (slides.length - 1) - 4) /
            (slides.length * CANVAS_WIDTH),
        ),
      )
    : THUMB_FALLBACK_SCALE;

  /** Snapshot the current slides before a change (grouped by time). */
  function recordHistory() {
    const h = historyRef.current;
    const now = historyNow();
    if (now - h.lastAt > HISTORY_GROUP_MS) {
      h.past.push(slidesRef.current);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
    }
    h.lastAt = now;
    h.future = [];
    setHistory({ canUndo: h.past.length > 0, canRedo: false });
  }

  function restoreSlides(next: Slide[]) {
    const current = slidesRef.current;
    // Jump to the slide the step touched (or keep the current one).
    const changed = next.find(
      (slide) => current.find((c) => c.id === slide.id) !== slide,
    );
    setSlides(next);
    if (changed) {
      setActiveId(changed.id);
    } else if (!next.some((slide) => slide.id === activeId)) {
      setActiveId(next[0]?.id ?? "");
    }
  }

  function undo() {
    if (!canEdit) return;
    const h = historyRef.current;
    const previous = h.past.pop();
    if (!previous) return;
    h.future.push(slidesRef.current);
    h.lastAt = 0;
    restoreSlides(previous);
    setHistory({ canUndo: h.past.length > 0, canRedo: true });
  }

  function redo() {
    if (!canEdit) return;
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(slidesRef.current);
    h.lastAt = 0;
    restoreSlides(next);
    setHistory({ canUndo: true, canRedo: h.future.length > 0 });
  }

  useLayoutEffect(() => {
    shortcutRef.current = { undo, redo };
  });

  useEffect(() => {
    if (!canEdit) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      // Text fields keep their own native undo.
      if (isTextEntryTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        shortcutRef.current.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        shortcutRef.current.redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit]);

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
    recordHistory();
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
        active.type === "quote" ||
        active.type === "frage")
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
        active.type === "quote" ||
        active.type === "frage"
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
    recordHistory();
    setSlides((prev) => [...prev, slide]);
    setActiveId(slide.id);
  }

  function duplicateActive() {
    if (!canEdit || !active) return;
    const idx = slides.findIndex((s) => s.id === active.id);
    if (idx < 0) return;
    const copy = duplicateSlide(active);
    const next = [...slides];
    next.splice(idx + 1, 0, copy);
    recordHistory();
    setSlides(next);
    setActiveId(copy.id);
  }

  function removeActive() {
    if (!canEdit || !active || slides.length <= 1) return;
    const idx = slides.findIndex((s) => s.id === active.id);
    const next = slides.filter((s) => s.id !== active.id);
    recordHistory();
    setSlides(next);
    setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0]!.id);
  }

  function moveSlideTo(slideId: string, insertIndex: number) {
    if (!canEdit) return;
    const from = slides.findIndex((s) => s.id === slideId);
    if (from < 0) return;
    const to = insertIndex > from ? insertIndex - 1 : insertIndex;
    if (to === from) return;
    const next = [...slides];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    recordHistory();
    setSlides(next);
    setActiveId(slideId);
  }

  function endThumbnailDrag() {
    setDragSlideId(null);
    setDropIndex(null);
    setDragStep(0);
  }

  function startThumbnailDrag(slideId: string) {
    const strip = thumbStripRef.current;
    const thumbs = strip
      ? Array.from(strip.querySelectorAll<HTMLElement>("[data-thumb]"))
      : [];
    thumbCentersRef.current = thumbs.map(
      (el) => el.offsetLeft + el.offsetWidth / 2,
    );
    const step =
      thumbs.length > 1
        ? thumbs[1]!.offsetLeft - thumbs[0]!.offsetLeft
        : (thumbs[0]?.offsetWidth ?? 0);
    setDragStep(step);
    setDragSlideId(slideId);
    setDropIndex(slides.findIndex((s) => s.id === slideId));
  }

  /** Insertion index for the pointer, based on positions before shifting. */
  function thumbDropIndexAt(clientX: number) {
    const strip = thumbStripRef.current;
    if (!strip) return null;
    const x = clientX - strip.getBoundingClientRect().left + strip.scrollLeft;
    return thumbCentersRef.current.filter((center) => center < x).length;
  }

  /** Live preview offset: others slide aside, the dragged one sits in the gap. */
  function thumbShift(index: number) {
    if (!dragSlideId || dropIndex === null || !dragStep) return 0;
    const from = slides.findIndex((s) => s.id === dragSlideId);
    if (from < 0) return 0;
    const to = dropIndex > from ? dropIndex - 1 : dropIndex;
    if (index === from) return (to - from) * dragStep;
    if (from < index && index <= to) return -dragStep;
    if (to <= index && index < from) return dragStep;
    return 0;
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

  async function applyBackgroundImage(imageUrl: string) {
    if (!active || !canEdit) return;
    if (
      active.type !== "cover" &&
      active.type !== "text" &&
      active.type !== "quote" &&
      active.type !== "frage"
    ) {
      return;
    }
    const size = await probeImageSize(imageUrl);
    const imageTransform = size
      ? defaultImageTransformForSize(size.width, size.height)
      : { ...DEFAULT_IMAGE_TRANSFORM };
    updateActive({
      backgroundImageUrl: imageUrl,
      imageTransform,
      imageCrop: undefined,
    });
    setSelectedLayer("image");
  }

  async function handleImageFile(file: File | null) {
    if (!file || !canEdit || !active) return;
    if (
      active.type !== "cover" &&
      active.type !== "text" &&
      active.type !== "quote" &&
      active.type !== "frage"
    ) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { dataUrl, width, height } = await fileToCompressedDataUrl(file);
      updateActive({
        backgroundImageUrl: dataUrl,
        imageTransform: defaultImageTransformForSize(width, height),
        imageCrop: undefined,
      });
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

  const canDropImage = Boolean(
    canEdit && active && slideSupportsBackgroundImage(active),
  );

  function handleImageDrop(data: DataTransfer) {
    const file = Array.from(data.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) {
      void handleImageFile(file);
      return;
    }
    if (data.files.length > 0) {
      setError("Bitte eine Bilddatei ablegen.");
      return;
    }
    const url = droppedImageUrl(data);
    if (url) {
      void applyBackgroundImage(url);
      return;
    }
    setError("Kein Bild gefunden – bitte eine Bilddatei ablegen.");
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
        <div className="min-w-0 flex-1 basis-full space-y-2 md:basis-0">
          <Link
            href="/carousel"
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            ← Alle Carousels
          </Link>
          {canEdit ? (
            <input
              className="w-full max-w-xl border-0 bg-transparent font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight outline-none ring-0 placeholder:text-[var(--muted)] sm:text-3xl"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Arbeitstitel"
            />
          ) : (
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
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
          ) : compact ? (
            <p className="text-sm text-[var(--muted)]">
              Ansicht auf dem Handy — zum Bearbeiten am Computer öffnen.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Text/Bild im Preview ziehen · Ecken ziehen zum Zoomen · Seiten
              ziehen zum Zuschneiden ·
              Doppelklick auf Text zum Bearbeiten · Bild per Drag & Drop auf den
              Slide · snap an Hilfslinien · Skala rechts
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <button
                type="button"
                className="btn btn-ghost !px-2.5"
                disabled={!history.canUndo}
                onClick={undo}
                title="Rückgängig (⌘Z)"
                aria-label="Rückgängig"
              >
                <Undo2 className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn-ghost !px-2.5"
                disabled={!history.canRedo}
                onClick={redo}
                title="Wiederholen (⇧⌘Z)"
                aria-label="Wiederholen"
              >
                <Redo2 className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </>
          ) : null}
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
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          ref={previewColumnRef}
          className="flex min-w-0 flex-col items-center gap-4"
        >
          {active ? (
            <div
              className="relative"
              onDragOver={(e) => {
                if (!canDropImage || dragSlideId) return;
                if (!isExternalImageDrag(e.dataTransfer)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!imageDragOver) setImageDragOver(true);
              }}
              onDragLeave={(e) => {
                if (
                  e.relatedTarget instanceof Node &&
                  e.currentTarget.contains(e.relatedTarget)
                ) {
                  return;
                }
                setImageDragOver(false);
              }}
              onDrop={(e) => {
                if (!canDropImage || dragSlideId) return;
                if (!isExternalImageDrag(e.dataTransfer)) return;
                e.preventDefault();
                setImageDragOver(false);
                handleImageDrop(e.dataTransfer);
              }}
            >
              <CarouselSlidePreview
                slide={active}
                scale={previewScale}
                interactive={canEditCanvas}
                selectedLayer={selectedLayer}
                onSelectLayer={setSelectedLayer}
                onImageTransform={(t) => setLayerTransform("image", t)}
                onTextTransform={(t) => setLayerTransform("text", t)}
                onTextChange={canEdit ? (patch) => updateActive(patch) : undefined}
                onImageCrop={
                  canEdit
                    ? (crop) => updateActive({ imageCrop: crop ?? undefined })
                    : undefined
                }
                format={format}
              />
              {imageDragOver ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-[var(--accent)] bg-black/55 text-sm font-semibold text-white">
                  <ImagePlus className="size-7" strokeWidth={1.75} aria-hidden />
                  Bild als Hintergrund ablegen
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex w-full flex-col items-center gap-2">
            <div
              ref={thumbStripRef}
              className="relative flex w-full gap-2 overflow-x-auto px-0.5 pt-0.5 pb-1 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
              onDragOver={(e) => {
                if (!dragSlideId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const next = thumbDropIndexAt(e.clientX);
                if (next !== null && next !== dropIndex) setDropIndex(next);
              }}
              onDrop={(e) => {
                if (!dragSlideId) return;
                e.preventDefault();
                if (dropIndex !== null) moveSlideTo(dragSlideId, dropIndex);
                endThumbnailDrag();
              }}
            >
              {slides.map((slide, index) => {
                const shift = thumbShift(index);
                return (
                  <button
                    key={slide.id}
                    type="button"
                    data-thumb
                    onClick={() => setActiveId(slide.id)}
                    draggable={canEdit && slides.length > 1}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", slide.id);
                      startThumbnailDrag(slide.id);
                    }}
                    onDragEnd={endThumbnailDrag}
                    className={[
                      "relative shrink-0 overflow-hidden rounded-lg ring-2",
                      dragSlideId
                        ? "transition-transform duration-200 ease-out"
                        : "transition",
                      slide.id === active?.id
                        ? "ring-[var(--accent)]"
                        : "ring-transparent hover:ring-[var(--border)]",
                      dragSlideId === slide.id ? "opacity-40" : "",
                      canEdit && slides.length > 1 ? "cursor-grab" : "",
                    ].join(" ")}
                    style={
                      shift ? { transform: `translateX(${shift}px)` } : undefined
                    }
                    title={`${SLIDE_TYPE_LABEL[slide.type]} ${index + 1}`}
                  >
                    {/* Inner images must not start their own drag. */}
                    <span className="pointer-events-none block">
                      <CarouselSlidePreview
                        slide={slide}
                        scale={thumbScale}
                        format={format}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(format === "6ibrief"
                ? SIXIBRIEF_ADDABLE_SLIDE_TYPES
                : isQuoteCascadeFormat(format)
                  ? QUOTE_CASCADE_ADDABLE_SLIDE_TYPES
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
                className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                disabled={!active}
                onClick={duplicateActive}
                title="Kopie direkt nach dieser Slide einfügen"
              >
                <Copy className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                Duplizieren
              </button>
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
                  Gestaltung
                </h2>
                {canEdit ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Text per Doppelklick direkt auf dem Slide bearbeiten.
                  </p>
                ) : null}
              </div>

              {canEdit ? (
                <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
                  <p className="text-xs font-extrabold tracking-wider text-[var(--muted)] uppercase">
                    Ebene
                  </p>
                  <LayerList
                    layers={
                      canEditImage
                        ? active && slideImageOnTop(active)
                          ? ["image", "text"]
                          : ["text", "image"]
                        : ["text"]
                    }
                    selected={selectedLayer}
                    textHint={active ? textLayerHint(active) : ""}
                    onSelect={setSelectedLayer}
                    onMove={(layer, direction) => {
                      // Two layers: moving either one swaps the stacking order.
                      const imageOnTop =
                        (layer === "image") === (direction === "up");
                      updateActive({
                        imageOnTop: imageOnTop ? true : undefined,
                      });
                    }}
                  />
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
                  {selectedLayer === "image" && canEditImage ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost px-3 py-1.5 text-sm"
                        title="Bild füllt den ganzen Slide (Ränder werden abgeschnitten)"
                        onClick={() => {
                          const url =
                            active && slideSupportsBackgroundImage(active)
                              ? active.backgroundImageUrl
                              : null;
                          if (!url) return;
                          void (async () => {
                            const size = await probeImageSizeAnyOrigin(url);
                            if (!size) return;
                            setLayerTransform(
                              "image",
                              fillImageTransformForSize(size.width, size.height),
                            );
                          })();
                        }}
                      >
                        Füllen
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost px-3 py-1.5 text-sm"
                        title="Ganzes Bild sichtbar, zentriert"
                        onClick={() =>
                          setLayerTransform("image", fitImageTransform())
                        }
                      >
                        Einpassen
                      </button>
                      {active &&
                      slideSupportsBackgroundImage(active) &&
                      normalizeImageCrop(active.imageCrop) ? (
                        <button
                          type="button"
                          className="btn btn-ghost px-3 py-1.5 text-sm"
                          title="Ganzes Bild wieder zeigen"
                          onClick={() => updateActive({ imageCrop: undefined })}
                        >
                          Zuschnitt entfernen
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-1.5 text-sm"
                    onClick={() => {
                      if (selectedLayer !== "image") {
                        setLayerTransform(selectedLayer, {
                          ...DEFAULT_TRANSFORM,
                        });
                        return;
                      }
                      const url =
                        active && slideSupportsBackgroundImage(active)
                          ? active.backgroundImageUrl
                          : null;
                      if (!url) {
                        setLayerTransform(selectedLayer, {
                          ...DEFAULT_IMAGE_TRANSFORM,
                        });
                        return;
                      }
                      void (async () => {
                        const size = await probeImageSize(url);
                        setLayerTransform(
                          "image",
                          size
                            ? defaultImageTransformForSize(
                                size.width,
                                size.height,
                              )
                            : { ...DEFAULT_IMAGE_TRANSFORM },
                        );
                      })();
                    }}
                  >
                    Position zurücksetzen
                  </button>
                </div>
              ) : null}

              {active.type === "text" ||
              active.type === "quote" ||
              active.type === "frage" ||
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
                      value={backgroundImageInputValue(active.backgroundImageUrl)}
                      onChange={(e) => {
                        if (
                          e.target.value === "(hochgeladen)" ||
                          e.target.value === "(Mediathek)" ||
                          e.target.value === "(Unsplash)"
                        ) {
                          return;
                        }
                        const next = e.target.value.trim();
                        if (!next) {
                          updateActive({ backgroundImageUrl: null });
                          return;
                        }
                        void applyBackgroundImage(next);
                      }}
                      placeholder="URL oder Quelle wählen"
                    />
                    {canEdit ? (
                      <div className="space-y-2">
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
                            className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {uploading ? (
                              <LoaderCircle
                                className="size-4 shrink-0 animate-spin"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            ) : (
                              <Upload
                                className="size-4 shrink-0"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            )}
                            {uploading ? "Lädt…" : "Hochladen"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            disabled={uploading}
                            onClick={() => setArchivePickerOpen(true)}
                          >
                            <Archive
                              className="size-4 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            Mediathek
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
                            disabled={uploading}
                            onClick={() => setUnsplashPickerOpen(true)}
                          >
                            <Camera
                              className="size-4 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            Unsplash
                          </button>
                        </div>
                        {active.backgroundImageUrl ? (
                          <button
                            type="button"
                            className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--danger)]"
                            onClick={() =>
                              updateActive({ backgroundImageUrl: null })
                            }
                          >
                            <Trash2
                              className="size-4 shrink-0"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                            Entfernen
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
                        active.type === "frage" ||
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
              active.type === "frage" ||
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
      {archivePickerOpen ? (
        <DamArchivePickerDialog
          onClose={() => setArchivePickerOpen(false)}
          onSelect={(imageUrl) => {
            void applyBackgroundImage(imageUrl);
            setArchivePickerOpen(false);
          }}
        />
      ) : null}
      {unsplashPickerOpen ? (
        <UnsplashPickerDialog
          onClose={() => setUnsplashPickerOpen(false)}
          onSelect={(imageUrl) => {
            void applyBackgroundImage(imageUrl);
            setUnsplashPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function slideImageOnTop(slide: Slide): boolean {
  return (
    (slide.type === "cover" ||
      slide.type === "text" ||
      slide.type === "quote" ||
      slide.type === "frage") &&
    Boolean(slide.imageOnTop)
  );
}

const LAYER_META: Record<
  EditableLayer,
  { label: string; icon: typeof Type }
> = {
  text: { label: "Text", icon: Type },
  image: { label: "Bild", icon: ImageIcon },
};

/** Layer panel: top of the list = front. Click selects, arrows restack. */
function LayerList({
  layers,
  selected,
  textHint,
  onSelect,
  onMove,
}: {
  layers: EditableLayer[];
  selected: EditableLayer;
  textHint: string;
  onSelect: (layer: EditableLayer) => void;
  onMove: (layer: EditableLayer, direction: "up" | "down") => void;
}) {
  const arrow =
    "inline-flex size-6 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--fg)] disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
      {layers.map((layer, index) => {
        const { label, icon: Icon } = LAYER_META[layer];
        const isSelected = selected === layer;
        return (
          <div
            key={layer}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onSelect(layer)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(layer);
              }
            }}
            className={[
              "flex cursor-pointer items-center gap-2 border-b border-[var(--border)] px-2 py-1.5 text-sm",
              isSelected
                ? "bg-[var(--accent)]/12 font-semibold"
                : "hover:bg-[var(--bg)]",
            ].join(" ")}
          >
            <Icon
              className="size-4 shrink-0 text-[var(--muted)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">
              {label}
              {layer === "text" && textHint ? (
                <span className="ml-1.5 font-normal text-[var(--muted)]">
                  {textHint}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className={arrow}
              disabled={index === 0}
              title="Nach vorne"
              aria-label={`${label} nach vorne`}
              onClick={(e) => {
                e.stopPropagation();
                onMove(layer, "up");
              }}
            >
              <ChevronUp className="size-4" strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className={arrow}
              disabled={index === layers.length - 1}
              title="Nach hinten"
              aria-label={`${label} nach hinten`}
              onClick={(e) => {
                e.stopPropagation();
                onMove(layer, "down");
              }}
            >
              <ChevronDown className="size-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--muted)]">
        <Lock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">Hintergrund</span>
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
