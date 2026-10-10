"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  backgroundColorForCategory,
  inkCssColor,
  resolveSlideInk,
  type SlideInk,
} from "@/lib/carousel/categories";
import { carouselFont, gtSectra, instrumentSans } from "@/lib/carousel/fonts";
import {
  decodeHtmlEntities,
  sanitizeSlideHtml,
  separateTsueritippEvents,
  slideHtmlFromEditable,
} from "@/lib/carousel/html";
import {
  GT_SECTRA_STACK,
  INSTRUMENT_SANS_STACK,
  SIXIBRIEF_BAR,
  SIXIBRIEF_BAR_HEIGHT,
  SIXIBRIEF_LOGO,
  SIXIBRIEF_LOGO_SOURCE,
  SIXIBRIEF_LOGO_SRC,
} from "@/lib/carousel/sixibrief";
import {
  defaultImageOverlayForSlideType,
  imageDimFilter,
  imageOverlayGradient,
  normalizeImageOverlay,
} from "@/lib/carousel/overlay";
import {
  clampLayerScale,
  containedImageSize,
  imageCropClipPath,
  MIN_CROP_VISIBLE,
  normalizeImageCrop,
  normalizeImageTransform,
  normalizeTransform,
  snapTransformOffsets,
} from "@/lib/carousel/transform";
import {
  BRAND_LOGO_SRC,
  BRAND_MARK,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_BG,
  TIPP_LOGO_TEAL_SRC,
  TIPP_LOGO_WHITE_SRC,
  type EditableLayer,
  type ImageCrop,
  type ImageOverlay,
  type LayerTransform,
  type Slide,
} from "@/lib/carousel/types";
import type { CarouselFormat } from "@/lib/carousel/format";
import { normalizeQuoteMarks } from "@/lib/carousel/quotes";

const CAROUSEL_FONT =
  "var(--font-carousel), 'Roboto', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', system-ui, sans-serif";

const SLIDE_TEXT_HYPHENS: CSSProperties = {
  hyphens: "auto",
  WebkitHyphens: "auto",
};

/** Spiral calendar close to 🗓️ (Twemoji-style), not a UI line icon. */
const CALENDAR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="1em" height="1em" aria-hidden="true" style="display:inline-block;vertical-align:-0.18em;margin-right:0.12em"><rect x="4" y="6" width="28" height="27" rx="3.5" fill="#fff"/><path d="M4 9.5c0-1.9 1.6-3.5 3.5-3.5h21c1.9 0 3.5 1.6 3.5 3.5V16H4V9.5z" fill="#dd2e44"/><g fill="none" stroke="#9aaab4" stroke-width="1.35"><path d="M9 20.5h18M9 25h18M9 29.5h18"/><path d="M13.5 18v13.5M18 18v13.5M22.5 18v13.5"/></g><g fill="none" stroke="#8b949a" stroke-width="2.1" stroke-linecap="round"><path d="M12 2.2c2.3 0 2.3 4.2 0 4.2s-2.3-4.2 0-4.2"/><path d="M24 2.2c2.3 0 2.3 4.2 0 4.2s-2.3-4.2 0-4.2"/></g><circle cx="12" cy="7.2" r="1.55" fill="#66757f"/><circle cx="24" cy="7.2" r="1.55" fill="#66757f"/></svg>`;

const CALENDAR_EMOJI_RE =
  /(?:\u{1F5D3}|\u{1F4C5})\u{FE0F}?|🗓️|📅/gu;

/** Rolled-up newspaper close to 🗞️ (Twemoji). */
const NEWSPAPER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="1em" height="1em" aria-hidden="true" style="display:inline-block;vertical-align:-0.18em;margin-right:0.12em"><path fill="#99AAB5" d="M31.679 4.724c-.082-.087-.159-.176-.244-.261-2.928-2.929-6.886-3.721-8.838-1.769L1.383 23.908l5.556 5.556 24.74-24.74z"/><path fill="#66757F" d="M10.222 25.676c-2.928-2.929-6.886-3.721-8.839-1.768-1.953 1.953-1.161 5.91 1.768 8.838 2.929 2.93 6.886 3.721 8.839 1.769 1.952-1.953 1.161-5.91-1.768-8.839z"/><path fill="#CCD6DD" d="M31.68 4.724c2.722 2.898 3.419 6.682 1.523 8.577L11.99 34.515c1.953-1.953 1.161-5.909-1.768-8.839l-3.889-3.889L27.546.573l4.142 4.142-.008.009z"/><path fill="#E1E8ED" d="M33.094 3.31c2.722 2.898 3.42 6.682 1.523 8.577L13.404 33.1c1.953-1.952 1.162-5.909-1.768-8.838l-2.475-2.475L30.374.573l2.728 2.728-.008.009z"/><path fill="#99AAB5" d="M2.21 25.003c-1.402 1.401-.838 4.371 1.281 6.759 1.916 2.158 4.947 4.008 7.186 2.123.762-.633 1.163-1.607 1.147-2.735-.028-1.974-1.298-4.192-3.313-5.79-.324-.258-.788-.199-1.054.121-.257.325-.203.797.122 1.054 1.647 1.305 2.724 3.126 2.746 4.638.007.474-.095 1.13-.612 1.566-1.514 1.273-3.917-.641-5.099-1.971-1.676-1.888-2.053-3.994-1.343-4.704.184-.184.412-.231.695-.147.877.262 2 1.662 2.534 4.205.085.406.483.666.889.581.405-.086.665-.483.579-.889-.589-2.81-1.958-4.853-3.573-5.335-.813-.243-1.609-.051-2.185.524zM28.432 4.286c-.02.019-.038.038-.055.06-.261.322-.209.794.112 1.054.031.024 3.1 2.539 3.257 5.816.021.413.373.732.785.712.415-.021.733-.372.714-.785-.19-3.96-3.668-6.794-3.816-6.912-.301-.242-.731-.212-.997.055zM26.31 6.407c-.019.019-.037.038-.055.06-.26.322-.208.794.113 1.055.031.024 3.1 2.539 3.257 5.816.021.414.372.732.785.712.414-.021.732-.372.714-.785-.191-3.96-3.668-6.794-3.816-6.912-.301-.243-.731-.213-.998.054zm-8.486 8.486c-.018.019-.037.038-.054.059-.261.322-.209.794.112 1.055.031.024 3.1 2.539 3.257 5.816.021.413.372.733.785.712.414-.021.732-.372.714-.785-.191-3.959-3.668-6.794-3.816-6.912-.301-.242-.73-.213-.998.055zm-4.949 4.949c-.019.019-.038.039-.055.06-.26.322-.208.794.112 1.055.032.024 3.1 2.539 3.257 5.816.02.413.373.732.786.711.414-.02.732-.371.713-.785-.191-3.959-3.667-6.793-3.816-6.912-.3-.241-.73-.213-.997.055z"/><path fill="#5DADEC" d="M24.775 19.539c1.296-1.348 3.49-3.383 3.756-3.661.613-.642-1.541-5.472-3.302-6.854-.386-.303-.859-.058-1.062.15-1.495 1.531-2.683 2.719-3.677 3.708-.231.231-.365.651-.039.952 1.067.984 2.986 3.424 3.528 5.663.064.261.528.323.796.042z"/></svg>`;

const NEWSPAPER_EMOJI_RE = /(?:\u{1F5DE}|\u{1F4F0})\u{FE0F}?|🗞️|📰/gu;

/** Backhand index pointing right close to 👉 (Twemoji). */
const POINTING_RIGHT_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="1em" height="1em" aria-hidden="true" style="display:inline-block;vertical-align:-0.18em;margin-right:0.12em"><path fill="#FFDC5D" d="M15.856 31s2.394-.208 3.068-1.792c.697-1.639-.622-2.309-.622-2.309s1.914.059 2.622-1.941c.668-1.885-.958-2.75-.958-2.75s1.871-.307 2.417-2.292C22.842 18.245 21.216 17 21.216 17h12.208c.959 0 2.575-.542 2.576-2.543.002-2-1.659-2.457-2.576-2.457h-20.5c-1 0-1-1 0-1h2.666c3.792 0 6.143-2.038 6.792-2.751.65-.713.979-1.667.734-2.82-.415-1.956-1.92-1.529-3.197-.975-3.078 1.337-7.464 2.254-9.538 2.533C4.523 7.778.006 12.796 0 18.871-.004 25.497 5.298 30.995 11.924 31h3.932z"/></svg>`;

const POINTING_RIGHT_EMOJI_RE = /\u{1F449}\u{FE0F}?|👉/gu;

function CalendarIcon() {
  return (
    <span
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-0.18em" }}
      dangerouslySetInnerHTML={{ __html: CALENDAR_ICON_SVG }}
    />
  );
}

export { sanitizeSlideHtml } from "@/lib/carousel/html";

function slideHtml(input: string): string {
  return sanitizeSlideHtml(input)
    .replace(CALENDAR_EMOJI_RE, CALENDAR_ICON_SVG)
    .replace(NEWSPAPER_EMOJI_RE, NEWSPAPER_ICON_SVG)
    .replace(POINTING_RIGHT_EMOJI_RE, POINTING_RIGHT_ICON_SVG);
}

function Category({ text, ink = "light" }: { text: string; ink?: SlideInk }) {
  return (
    <p
      className="pointer-events-none absolute left-0 right-0 z-20 text-center font-normal tracking-[0.02em] uppercase"
      style={{
        top: 55,
        fontSize: 30,
        lineHeight: 1.2,
        fontFamily: CAROUSEL_FONT,
        color: inkCssColor(ink),
      }}
    >
      {text || "STADTLEBEN"}
    </p>
  );
}

function TippMark({ color }: { color: "teal" | "white" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={color === "teal" ? TIPP_LOGO_TEAL_SRC : TIPP_LOGO_WHITE_SRC}
      alt=""
      width={240}
      height={132}
      className="pointer-events-none absolute z-20 object-contain object-left"
      style={{ left: 80, top: 52, width: 240, height: 132 }}
      aria-hidden
    />
  );
}

function SixiBriefLogo() {
  const { left, top, width, height } = SIXIBRIEF_LOGO;
  const { width: srcW, height: srcH, glyph } = SIXIBRIEF_LOGO_SOURCE;
  const scale = width / glyph.width;
  const drawnGlyphW = glyph.width * scale;
  const drawnGlyphH = glyph.height * scale;
  return (
    <div
      className="pointer-events-none absolute z-20 overflow-hidden"
      style={{ left, top, width, height }}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SIXIBRIEF_LOGO_SRC}
        alt=""
        width={srcW}
        height={srcH}
        className="absolute max-w-none"
        style={{
          width: srcW * scale,
          height: srcH * scale,
          left: (width - drawnGlyphW) / 2 - glyph.left * scale,
          top: (height - drawnGlyphH) / 2 - glyph.top * scale,
          maxWidth: "none",
        }}
      />
    </div>
  );
}

function SixiBriefBar() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-40"
      style={{ height: SIXIBRIEF_BAR_HEIGHT, backgroundColor: SIXIBRIEF_BAR }}
      aria-hidden
    />
  );
}

function SlideChrome({
  format,
  slideType,
  category,
  ink,
}: {
  format?: CarouselFormat;
  slideType: Slide["type"];
  category: string;
  ink: SlideInk;
}) {
  if (format === "6ibrief") {
    return <SixiBriefBar />;
  }
  if (format === "tsueritipp") {
    return <TippMark color={slideType === "cover" ? "teal" : "white"} />;
  }
  return <Category text={category} ink={ink} />;
}

function withCalendarEmoji(meta: string): {
  icon: boolean;
  text: string;
} {
  const trimmed = meta.trim();
  if (!trimmed) return { icon: false, text: "" };
  const stripped = trimmed.replace(CALENDAR_EMOJI_RE, "").trimStart();
  return { icon: true, text: stripped };
}

const BRAND_LOGO_WIDTH = Math.round(231 * 1.27);
const BRAND_LOGO_HEIGHT = Math.round(76 * 1.27);

function BrandMark({ ink = "light" }: { ink?: SlideInk }) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex justify-center"
      style={{ bottom: 7 }}
    >
      <img
        src={BRAND_LOGO_SRC}
        alt={BRAND_MARK}
        width={BRAND_LOGO_WIDTH}
        height={BRAND_LOGO_HEIGHT}
        className="object-contain object-center"
        style={{
          width: BRAND_LOGO_WIDTH,
          height: BRAND_LOGO_HEIGHT,
          // white on dark slides / black on bright category colors
          filter: ink === "dark" ? "brightness(0)" : "brightness(0) invert(1)",
        }}
      />
    </div>
  );
}

function Guides({
  vertical,
  horizontal,
}: {
  vertical: number | null;
  horizontal: number | null;
}) {
  return (
    <>
      {vertical !== null ? (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-40 w-px bg-[var(--highlight)]"
          style={{ left: vertical }}
        />
      ) : null}
      {horizontal !== null ? (
        <div
          className="pointer-events-none absolute left-0 right-0 z-40 h-px bg-[var(--highlight)]"
          style={{ top: horizontal }}
        />
      ) : null}
    </>
  );
}

function ImageLayer({
  url,
  transform,
  overlay,
  overlayDefaults,
  crop,
  cropBackground,
  onTop,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  url: string | null;
  transform: LayerTransform;
  overlay?: Partial<ImageOverlay> | null;
  overlayDefaults?: ImageOverlay;
  /** Cut-off edges of the photo; null/undefined renders exactly as before. */
  crop?: ImageCrop | null;
  /** Shown where the photo is cropped away. */
  cropBackground?: string;
  /** Stack the photo above the text layer. */
  onTop?: boolean;
  className?: string;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const t = normalizeTransform(transform);
  const o = normalizeImageOverlay(overlay, overlayDefaults);
  const c = url ? normalizeImageCrop(crop) : null;
  return (
    <>
      {c ? (
        <div
          className="absolute inset-0 z-0"
          style={{ backgroundColor: cropBackground ?? DEFAULT_BG }}
        />
      ) : null}
    <div
      className={`absolute inset-0 ${onTop ? "z-[35]" : "z-0"} overflow-hidden ${className ?? ""}`}
      style={{
        backgroundColor: "#1a1a1a",
        transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
        transformOrigin: "center center",
        clipPath: c ? imageCropClipPath(c) : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {url ? (
        // <img> (not CSS background) so html-to-image can embed after export inlining.
        // Do not set crossOrigin here — external CDNs without CORS would fail to display.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          style={{ filter: imageDimFilter(o.dim) }}
        />
      ) : null}
    </div>
    </>
  );
}

function ImageScrim({
  hasImage,
  overlay,
  overlayDefaults,
  fallback,
}: {
  hasImage: boolean;
  overlay?: Partial<ImageOverlay> | null;
  overlayDefaults?: ImageOverlay;
  fallback?: string;
}) {
  const o = normalizeImageOverlay(overlay, overlayDefaults);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      style={{
        background: hasImage
          ? imageOverlayGradient(o)
          : (fallback ??
            "linear-gradient(180deg, #2a2a2a 0%, #111 100%)"),
      }}
    />
  );
}

function textTransformStyle(
  transform: LayerTransform | undefined,
  origin: string,
): CSSProperties {
  const t = normalizeTransform(transform);
  return {
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
    transformOrigin: origin,
  };
}

/** Only provided for the interactive editor canvas (never for export/thumbnails). */
type CanvasEditContextValue = {
  editingField: string | null;
  caretPoint: { x: number; y: number } | null;
  onFieldChange?: (field: string, value: string) => void;
  stopEditing: () => void;
  setManipulating: (layer: EditableLayer | null) => void;
};

const CanvasEditContext = createContext<CanvasEditContextValue | null>(null);

function placeCaret(el: HTMLElement, point: { x: number; y: number } | null) {
  const selection = window.getSelection();
  if (!selection) return;
  let range: Range | null = null;
  if (point) {
    if ("caretPositionFromPoint" in document) {
      const pos = document.caretPositionFromPoint(point.x, point.y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    } else if ("caretRangeFromPoint" in document) {
      range = (
        document as Document & {
          caretRangeFromPoint: (x: number, y: number) => Range | null;
        }
      ).caretRangeFromPoint(point.x, point.y);
    }
  }
  if (!range || !el.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Faded "+ label" for an empty optional field on the editor canvas. */
function EmptyFieldHint({ label }: { label: string }) {
  return <span style={{ opacity: 0.45, fontStyle: "italic" }}>+ {label}</span>;
}

type SlideTextProps = {
  /** Slide property this element shows (e.g. "headline", "bodyHtml"). */
  field: string;
  /** html: <b>/<i>/line breaks allowed; plain: text only. */
  mode: "html" | "plain";
  /** Raw stored value of the field. */
  value: string;
  multiline?: boolean;
  as?: "p" | "div";
  html?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "dangerouslySetInnerHTML">;

/**
 * Renders a text field exactly as before; on the interactive canvas it is
 * marked for double-click editing and swaps to an inline editor while active.
 */
function SlideText({
  field,
  mode,
  value,
  multiline = true,
  as = "p",
  html,
  children,
  ...rest
}: SlideTextProps) {
  const ctx = useContext(CanvasEditContext);
  if (ctx?.onFieldChange && ctx.editingField === field) {
    return (
      <InlineTextEditor
        as={as}
        field={field}
        mode={mode}
        value={value}
        multiline={multiline}
        {...rest}
      />
    );
  }
  const Tag = as;
  const marker = ctx?.onFieldChange ? { "data-edit-field": field } : {};
  if (html !== undefined) {
    return (
      <Tag {...rest} {...marker} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  return (
    <Tag {...rest} {...marker}>
      {children}
    </Tag>
  );
}

function InlineTextEditor({
  as,
  field,
  mode,
  value,
  multiline,
  style,
  onPointerDown,
  ...rest
}: Omit<SlideTextProps, "html" | "children"> & { as: "p" | "div" }) {
  const ctx = useContext(CanvasEditContext);
  const ref = useRef<HTMLDivElement>(null);
  // Content is seeded once; afterwards the DOM owns it (no caret jumps).
  const [initial] = useState(() => ({
    value,
    point: ctx?.caretPoint ?? null,
  }));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (mode === "html") {
      el.innerHTML = sanitizeSlideHtml(initial.value);
    } else {
      el.textContent = decodeHtmlEntities(initial.value);
    }
    el.focus({ preventScroll: true });
    placeCaret(el, initial.point);
  }, [initial, mode]);

  function commit() {
    const el = ref.current;
    if (!el || !ctx?.onFieldChange) return;
    const next =
      mode === "html"
        ? slideHtmlFromEditable(el)
        : el.innerText.replace(/ /g, " ").replace(/\n$/, "");
    ctx.onFieldChange(field, multiline ? next : next.replace(/\n/g, " "));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!multiline) {
        e.currentTarget.blur();
        return;
      }
      document.execCommand("insertLineBreak");
    }
  }

  const Tag = as as "div";
  return (
    <Tag
      {...rest}
      ref={ref as RefObject<HTMLDivElement>}
      data-edit-field={field}
      contentEditable={mode === "plain" ? "plaintext-only" : true}
      suppressContentEditableWarning
      spellCheck
      style={{
        ...style,
        whiteSpace: mode === "plain" ? "pre-wrap" : style?.whiteSpace,
        minWidth: "0.5em",
        minHeight: "1em",
        cursor: "text",
        userSelect: "text",
        // Native caret is scaled with the canvas and often vanishes;
        // InlineCaret draws a visible one instead.
        caretColor: "transparent",
        outline: "2px solid var(--highlight)",
        outlineOffset: 6,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown?.(e);
      }}
      onInput={commit}
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand(
          "insertText",
          false,
          multiline ? text : text.replace(/\s*\n\s*/g, " "),
        );
      }}
      onBlur={() => ctx?.stopEditing()}
    />
  );
}

type InteractiveProps = {
  interactive?: boolean;
  selectedLayer?: EditableLayer | null;
  onSelectLayer?: (layer: EditableLayer) => void;
  onImageTransform?: (transform: LayerTransform) => void;
  onTextTransform?: (transform: LayerTransform) => void;
  previewScale?: number;
  format?: CarouselFormat;
};

/**
 * Blocks page text selection while a layer or handle is dragged; released on
 * the next pointerup/pointercancel anywhere in the window.
 */
function lockPageSelection() {
  const body = document.body;
  body.style.userSelect = "none";
  body.style.webkitUserSelect = "none";
  window.getSelection()?.removeAllRanges();
  const release = () => {
    body.style.userSelect = "";
    body.style.webkitUserSelect = "";
    window.removeEventListener("pointerup", release);
    window.removeEventListener("pointercancel", release);
  };
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);
}

function useLayerDrag({
  enabled: enabledProp,
  layer,
  selected,
  transform,
  anchorX,
  anchorY,
  previewScale,
  onSelect,
  onChange,
  onGuides,
}: {
  enabled: boolean;
  layer: EditableLayer;
  selected: boolean;
  transform: LayerTransform;
  anchorX: number;
  anchorY: number;
  previewScale: number;
  onSelect?: (layer: EditableLayer) => void;
  onChange?: (transform: LayerTransform) => void;
  onGuides?: (guides: { v: number | null; h: number | null }) => void;
}) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origin: LayerTransform;
  } | null>(null);
  const editCtx = useContext(CanvasEditContext);
  // While a text field is edited inline, clicks place the caret instead of dragging.
  const editing = layer === "text" && Boolean(editCtx?.editingField);
  const enabled = enabledProp && !editing;

  return {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      if (!enabled) return;
      e.stopPropagation();
      onSelect?.(layer);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...transform },
      };
      editCtx?.setManipulating(layer);
      lockPageSelection();
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      if (!enabled || !dragRef.current || !onChange) return;
      const dx = (e.clientX - dragRef.current.startX) / previewScale;
      const dy = (e.clientY - dragRef.current.startY) / previewScale;
      const nextX = dragRef.current.origin.x + dx;
      const nextY = dragRef.current.origin.y + dy;
      const snapped = snapTransformOffsets(nextX, nextY, anchorX, anchorY);
      onGuides?.(snapped.guides);
      onChange({
        x: snapped.x,
        y: snapped.y,
        scale: dragRef.current.origin.scale,
      });
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (!enabled) return;
      dragRef.current = null;
      onGuides?.({ v: null, h: null });
      editCtx?.setManipulating(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    className: [
      enabled ? "cursor-grab active:cursor-grabbing" : "",
      selected && enabledProp
        ? "outline outline-2 outline-[var(--highlight)]"
        : "",
      // Marker for the selection overlay (corner handles); no styling.
      enabledProp && editCtx ? `carousel-${layer}-layer` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function CoverPreview({
  slide,
  interactive,
  selectedLayer,
  onSelectLayer,
  onImageTransform,
  onTextTransform,
  previewScale = 1,
  format,
  onGuides,
}: {
  slide: Extract<Slide, { type: "cover" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const imageT = normalizeImageTransform(slide.imageTransform);
  const textT = normalizeTransform(slide.textTransform);
  const editCtx = useContext(CanvasEditContext);
  const editingField = editCtx?.editingField ?? null;
  // Editor only: empty optional fields stay visible as a hint to double-click.
  const canvasEditable = Boolean(editCtx?.onFieldChange);
  const isTipp = format === "tsueritipp";
  const isSixi = format === "6ibrief";
  const hasPhoto = Boolean(slide.backgroundImageUrl);
  const imageDrag = useLayerDrag({
    enabled: Boolean(interactive && slide.backgroundImageUrl),
    layer: "image",
    selected: selectedLayer === "image",
    transform: imageT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onImageTransform,
    onGuides,
  });
  const textDrag = useLayerDrag({
    enabled: Boolean(interactive),
    layer: "text",
    selected: selectedLayer === "text",
    transform: textT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT - 320,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onTextTransform,
    onGuides,
  });

  return (
    <>
      <ImageLayer
        url={slide.backgroundImageUrl}
        transform={imageT}
        overlay={slide.imageOverlay}
        crop={slide.imageCrop}
        cropBackground={backgroundColorForCategory(slide.category)}
        onTop={slide.imageOnTop}
        className={imageDrag.className}
        onPointerDown={imageDrag.onPointerDown}
        onPointerMove={imageDrag.onPointerMove}
        onPointerUp={imageDrag.onPointerUp}
      />
      <ImageScrim
        hasImage={hasPhoto}
        overlay={slide.imageOverlay}
      />
      {isSixi && !hasPhoto ? (
        <p
          className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center font-medium"
          style={{
            fontFamily: INSTRUMENT_SANS_STACK,
            fontSize: 36,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          Bild einfügen
        </p>
      ) : null}
      <SlideChrome
        format={format}
        slideType="cover"
        category={slide.category}
        ink="light"
      />
      {isSixi ? <SixiBriefLogo /> : null}
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: isSixi ? 80 : 88,
          right: 88,
          bottom: isSixi ? 160 : 220,
          fontFamily: isSixi ? GT_SECTRA_STACK : CAROUSEL_FONT,
          color: inkCssColor("light"),
          ...textTransformStyle(textT, "left bottom"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        {slide.overline || editingField === "overline" || canvasEditable ? (
          <SlideText
            field="overline"
            mode="plain"
            value={slide.overline}
            multiline={false}
            className="font-normal"
            style={{
              fontSize: isSixi ? 41 : 35,
              lineHeight: 1.2,
              marginBottom: isSixi ? 18 : 20,
              fontFamily: isSixi ? INSTRUMENT_SANS_STACK : undefined,
              fontWeight: isSixi ? 400 : undefined,
            }}
          >
            {decodeHtmlEntities(slide.overline) || (
              <EmptyFieldHint label="Overline" />
            )}
          </SlideText>
        ) : null}
        <SlideText
          field="headline"
          mode="plain"
          value={slide.headline}
          multiline={isTipp || isSixi}
          className={isSixi ? "font-medium" : "font-bold"}
          style={{
            fontSize: isSixi ? 81 : 68,
            lineHeight: isSixi ? 1.08 : 1.12,
            fontWeight: isSixi ? 500 : undefined,
            whiteSpace: isTipp || isSixi ? "pre-wrap" : undefined,
          }}
        >
          {decodeHtmlEntities(slide.headline) || "Headline…"}
        </SlideText>
      </div>
      {isSixi ? null : <BrandMark ink="light" />}
    </>
  );
}

function TextPreview({
  slide,
  interactive,
  selectedLayer,
  onSelectLayer,
  onImageTransform,
  onTextTransform,
  previewScale = 1,
  format,
  onGuides,
}: {
  slide: Extract<Slide, { type: "text" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const hasImage = Boolean(slide.backgroundImageUrl);
  const isSixi = format === "6ibrief";
  const isTipp = format === "tsueritipp";
  const ink: SlideInk = hasImage ? "light" : resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  const imageT = normalizeImageTransform(slide.imageTransform);
  const textT = normalizeTransform(slide.textTransform);
  const imageDrag = useLayerDrag({
    enabled: Boolean(interactive && hasImage),
    layer: "image",
    selected: selectedLayer === "image",
    transform: imageT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onImageTransform,
    onGuides,
  });
  const textDrag = useLayerDrag({
    enabled: Boolean(interactive),
    layer: "text",
    selected: selectedLayer === "text",
    transform: textT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onTextTransform,
    onGuides,
  });

  return (
    <>
      {hasImage ? (
        <>
          <ImageLayer
            url={slide.backgroundImageUrl}
            transform={imageT}
            overlay={slide.imageOverlay}
            crop={slide.imageCrop}
            cropBackground={slide.backgroundColor || DEFAULT_BG}
            onTop={slide.imageOnTop}
            overlayDefaults={defaultImageOverlayForSlideType("text")}
            className={imageDrag.className}
            onPointerDown={imageDrag.onPointerDown}
            onPointerMove={imageDrag.onPointerMove}
            onPointerUp={imageDrag.onPointerUp}
          />
          <ImageScrim
            hasImage
            overlay={slide.imageOverlay}
            overlayDefaults={defaultImageOverlayForSlideType("text")}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <SlideChrome
        format={format}
        slideType="text"
        category={slide.category}
        ink={ink}
      />
      <SlideText
        as="div"
        field="bodyHtml"
        mode="html"
        value={slide.bodyHtml}
        className={`carousel-slide-text absolute z-30 overflow-hidden ${isSixi ? "sixibrief-text" : ""} ${textDrag.className}`}
        style={{
          left: isSixi ? 80 : 100,
          right: isSixi ? 80 : 100,
          top: isSixi ? 88 : 200,
          bottom: isSixi ? 80 : 180,
          fontSize: isSixi ? 54 : 53.4,
          lineHeight: isSixi ? 1.38 : 1.05,
          fontFamily: isSixi ? INSTRUMENT_SANS_STACK : CAROUSEL_FONT,
          fontWeight: 400,
          color: inkColor,
          textAlign: isSixi ? "left" : undefined,
          ...SLIDE_TEXT_HYPHENS,
          ...textTransformStyle(textT, isSixi ? "left top" : "center top"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
        html={
          slideHtml(
            isTipp
              ? separateTsueritippEvents(slide.bodyHtml)
              : slide.bodyHtml,
          ) || "<span style='opacity:0.55'>Text…</span>"
        }
      />
      {isSixi ? null : <BrandMark ink={ink} />}
    </>
  );
}

function QuotePreview({
  slide,
  interactive,
  selectedLayer,
  onSelectLayer,
  onImageTransform,
  onTextTransform,
  previewScale = 1,
  format,
  onGuides,
}: {
  slide: Extract<Slide, { type: "quote" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const hasImage = Boolean(slide.backgroundImageUrl);
  const ink: SlideInk = hasImage ? "light" : resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  const imageT = normalizeImageTransform(slide.imageTransform);
  const textT = normalizeTransform(slide.textTransform);
  const editCtx = useContext(CanvasEditContext);
  const editingField = editCtx?.editingField ?? null;
  // Editor only: empty optional fields stay visible as a hint to double-click.
  const canvasEditable = Boolean(editCtx?.onFieldChange);
  const imageDrag = useLayerDrag({
    enabled: Boolean(interactive && hasImage),
    layer: "image",
    selected: selectedLayer === "image",
    transform: imageT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onImageTransform,
    onGuides,
  });
  const textDrag = useLayerDrag({
    enabled: Boolean(interactive),
    layer: "text",
    selected: selectedLayer === "text",
    transform: textT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onTextTransform,
    onGuides,
  });

  return (
    <>
      {hasImage ? (
        <>
          <ImageLayer
            url={slide.backgroundImageUrl}
            transform={imageT}
            overlay={slide.imageOverlay}
            crop={slide.imageCrop}
            cropBackground={slide.backgroundColor || DEFAULT_BG}
            onTop={slide.imageOnTop}
            overlayDefaults={defaultImageOverlayForSlideType("quote")}
            className={imageDrag.className}
            onPointerDown={imageDrag.onPointerDown}
            onPointerMove={imageDrag.onPointerMove}
            onPointerUp={imageDrag.onPointerUp}
          />
          <ImageScrim
            hasImage
            overlay={slide.imageOverlay}
            overlayDefaults={defaultImageOverlayForSlideType("quote")}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <SlideChrome
        format={format}
        slideType="quote"
        category={slide.category}
        ink={ink}
      />
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: 100,
          right: 100,
          top: 210,
          bottom: 180,
          fontFamily: CAROUSEL_FONT,
          color: inkColor,
          ...textTransformStyle(textT, "left top"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        <p
          className="font-bold"
          style={{
            fontSize: 240,
            // Compress em-box to « ink height (~95px); 50px gap to body like Canva.
            lineHeight: 0.45,
            marginBottom: 50,
          }}
        >
          «
        </p>
        <SlideText
          field="quoteText"
          mode="html"
          value={slide.quoteText}
          className="carousel-slide-text font-bold"
          style={{
            fontSize: 53.4,
            lineHeight: 1.25,
            whiteSpace: "pre-wrap",
            ...SLIDE_TEXT_HYPHENS,
          }}
          html={(() => {
            const raw = normalizeQuoteMarks(slide.quoteText || "Zitat…");
            const html = slideHtml(raw);
            const plain = raw.replace(/<[^>]+>/g, "");
            if (plain.trimEnd().endsWith("»")) return html;
            return `${html}»`;
          })()}
        />
        {slide.attribution ||
        editingField === "attribution" ||
        canvasEditable ? (
          <SlideText
            field="attribution"
            mode="plain"
            value={slide.attribution}
            multiline={false}
            className="font-normal opacity-95"
            style={{ fontSize: 40.05, lineHeight: 1.2, marginTop: 52 }}
          >
            {decodeHtmlEntities(slide.attribution) || (
              <EmptyFieldHint label="Name, Rolle" />
            )}
          </SlideText>
        ) : null}
      </div>
      <BrandMark ink={ink} />
    </>
  );
}

function FragePreview({
  slide,
  interactive,
  selectedLayer,
  onSelectLayer,
  onImageTransform,
  onTextTransform,
  previewScale = 1,
  format,
  onGuides,
}: {
  slide: Extract<Slide, { type: "frage" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const hasImage = Boolean(slide.backgroundImageUrl);
  const ink: SlideInk = hasImage ? "light" : resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  const imageT = normalizeImageTransform(slide.imageTransform);
  const textT = normalizeTransform(slide.textTransform);
  const editCtx = useContext(CanvasEditContext);
  const editingField = editCtx?.editingField ?? null;
  // Editor only: empty optional fields stay visible as a hint to double-click.
  const canvasEditable = Boolean(editCtx?.onFieldChange);
  const imageDrag = useLayerDrag({
    enabled: Boolean(interactive && hasImage),
    layer: "image",
    selected: selectedLayer === "image",
    transform: imageT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onImageTransform,
    onGuides,
  });
  const textDrag = useLayerDrag({
    enabled: Boolean(interactive),
    layer: "text",
    selected: selectedLayer === "text",
    transform: textT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT / 2,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onTextTransform,
    onGuides,
  });

  return (
    <>
      {hasImage ? (
        <>
          <ImageLayer
            url={slide.backgroundImageUrl}
            transform={imageT}
            overlay={slide.imageOverlay}
            crop={slide.imageCrop}
            cropBackground={slide.backgroundColor || DEFAULT_BG}
            onTop={slide.imageOnTop}
            overlayDefaults={defaultImageOverlayForSlideType("frage")}
            className={imageDrag.className}
            onPointerDown={imageDrag.onPointerDown}
            onPointerMove={imageDrag.onPointerMove}
            onPointerUp={imageDrag.onPointerUp}
          />
          <ImageScrim
            hasImage
            overlay={slide.imageOverlay}
            overlayDefaults={defaultImageOverlayForSlideType("frage")}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <SlideChrome
        format={format}
        slideType="frage"
        category={slide.category}
        ink={ink}
      />
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: 100,
          right: 100,
          top: 200,
          bottom: 180,
          fontFamily: CAROUSEL_FONT,
          color: inkColor,
          ...textTransformStyle(textT, "left top"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        <SlideText
          field="questionText"
          mode="plain"
          value={slide.questionText}
          className="carousel-slide-text italic font-normal"
          style={{
            fontSize: 53.4,
            lineHeight: 1.2,
            textAlign: "left",
            whiteSpace: "pre-wrap",
            ...SLIDE_TEXT_HYPHENS,
          }}
        >
          {decodeHtmlEntities(slide.questionText) || "Frage…"}
        </SlideText>
        <div style={{ marginTop: 56 }}>
          <p
            className="font-bold"
            style={{
              fontSize: 240,
              lineHeight: 0.45,
              marginBottom: 50,
              textAlign: "left",
            }}
          >
            «
          </p>
          <SlideText
            field="quoteText"
            mode="html"
            value={slide.quoteText}
            className="carousel-slide-text font-bold"
            style={{
              fontSize: 53.4,
              lineHeight: 1.25,
              textAlign: "left",
              whiteSpace: "pre-wrap",
              ...SLIDE_TEXT_HYPHENS,
            }}
            html={(() => {
              const raw = normalizeQuoteMarks(slide.quoteText || "Zitat…");
              const html = slideHtml(raw);
              const plain = raw.replace(/<[^>]+>/g, "");
              if (plain.trimEnd().endsWith("»")) return html;
              return `${html}»`;
            })()}
          />
          {slide.attribution ||
        editingField === "attribution" ||
        canvasEditable ? (
            <SlideText
              field="attribution"
              mode="plain"
              value={slide.attribution}
              multiline={false}
              className="font-normal opacity-95"
              style={{
                fontSize: 40.05,
                lineHeight: 1.2,
                marginTop: 52,
                textAlign: "left",
              }}
            >
              {decodeHtmlEntities(slide.attribution) || (
              <EmptyFieldHint label="Name, Rolle" />
            )}
            </SlideText>
          ) : null}
        </div>
      </div>
      <BrandMark ink={ink} />
    </>
  );
}

function TippItemPreview({
  slide,
  format,
}: {
  slide: Extract<Slide, { type: "tipp-item" }>;
} & Pick<InteractiveProps, "format">) {
  const ink = resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
      />
      <SlideChrome
        format={format}
        slideType="tipp-item"
        category={slide.category}
        ink={ink}
      />
      <div
        className="carousel-slide-text absolute z-30 overflow-hidden"
        style={{
          left: 88,
          right: 88,
          top: 210,
          bottom: 180,
          fontFamily: CAROUSEL_FONT,
          color: inkColor,
          ...SLIDE_TEXT_HYPHENS,
        }}
      >
        {slide.items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            style={{ marginBottom: index === slide.items.length - 1 ? 0 : 56 }}
          >
            <p className="font-bold" style={{ fontSize: 52, lineHeight: 1.15 }}>
              {decodeHtmlEntities(item.title) || "Wochentag: Thema."}
            </p>
            <p
              className="font-normal"
              style={{ fontSize: 40, lineHeight: 1.25, marginTop: 16 }}
            >
              {decodeHtmlEntities(item.body) || "Termintext…"}
            </p>
            {item.meta ? (
              <p
                className="font-normal"
                style={{ fontSize: 36, lineHeight: 1.2, marginTop: 16 }}
              >
                <CalendarIcon />
                {withCalendarEmoji(decodeHtmlEntities(item.meta)).text}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <BrandMark ink={ink} />
    </>
  );
}

function OutroPreview({
  slide,
  interactive,
  selectedLayer,
  onSelectLayer,
  onTextTransform,
  previewScale = 1,
  format,
  onGuides,
}: {
  slide: Extract<Slide, { type: "outro" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const ink = resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  const isSixi = format === "6ibrief";
  const textT = normalizeTransform(slide.textTransform);
  const textDrag = useLayerDrag({
    enabled: Boolean(interactive),
    layer: "text",
    selected: selectedLayer === "text",
    transform: textT,
    anchorX: CANVAS_WIDTH / 2,
    anchorY: CANVAS_HEIGHT * 0.42,
    previewScale,
    onSelect: onSelectLayer,
    onChange: onTextTransform,
    onGuides,
  });

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
      />
      <SlideChrome
        format={format}
        slideType="outro"
        category={slide.category}
        ink={ink}
      />
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: 80,
          right: 80,
          top: isSixi ? "38%" : "42%",
          fontFamily: isSixi ? GT_SECTRA_STACK : CAROUSEL_FONT,
          color: inkColor,
          textAlign: isSixi ? "left" : undefined,
          ...textTransformStyle(
            {
              ...textT,
              // preserve vertical centering of the block, then apply offsets
              x: textT.x,
              y: textT.y,
            },
            isSixi ? "left center" : "center center",
          ),
          transform: `translateY(-50%) translate(${textT.x}px, ${textT.y}px) scale(${textT.scale})`,
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        <SlideText
          field="headline"
          mode="html"
          value={slide.headline}
          className={isSixi ? "font-medium" : "font-bold"}
          style={{
            fontSize: isSixi ? 74 : 76,
            lineHeight: isSixi ? 1.28 : 1.32,
            fontWeight: isSixi ? 500 : undefined,
          }}
          html={slideHtml(slide.headline || "Headline…")}
        />
        {isSixi ? null : (
          <SlideText
            field="ctaText"
            mode="plain"
            value={slide.ctaText}
            multiline={false}
            className="text-right font-normal tracking-[0.05em] uppercase"
            style={{
              fontSize: 40,
              lineHeight: 1.2,
              marginTop: 28,
              fontFamily: CAROUSEL_FONT,
            }}
          >
            {decodeHtmlEntities(slide.ctaText) || "LINK IN DER BIO"}
          </SlideText>
        )}
      </div>
      {isSixi ? (
        <SlideText
          field="ctaText"
          mode="plain"
          value={slide.ctaText}
          multiline={false}
          className="absolute z-30 font-bold"
          style={{
            left: 80,
            bottom: 72,
            fontSize: 41,
            lineHeight: 1.2,
            fontFamily: INSTRUMENT_SANS_STACK,
            fontWeight: 700,
            color: inkColor,
          }}
        >
          {decodeHtmlEntities(slide.ctaText) || "→ Link in der Bio"}
        </SlideText>
      ) : (
        <BrandMark ink={ink} />
      )}
    </>
  );
}

type Corner = { x: 0 | 1; y: 0 | 1 };

const CORNERS: Corner[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

const HANDLE_SIZE = 12;
const EDGE_HANDLE_LONG = 22;
const EDGE_HANDLE_SHORT = 8;

function slideImageUrl(slide: Slide): string | null {
  return slide.type === "cover" ||
    slide.type === "text" ||
    slide.type === "quote" ||
    slide.type === "frage"
    ? slide.backgroundImageUrl
    : null;
}

function slideImageTransform(slide: Slide): LayerTransform {
  return slide.type === "cover" ||
    slide.type === "text" ||
    slide.type === "quote" ||
    slide.type === "frage"
    ? normalizeImageTransform(slide.imageTransform)
    : normalizeImageTransform(null);
}

function slideImageCrop(slide: Slide): ImageCrop | null {
  return slide.type === "cover" ||
    slide.type === "text" ||
    slide.type === "quote" ||
    slide.type === "frage"
    ? normalizeImageCrop(slide.imageCrop)
    : null;
}

type CropSide = "left" | "right" | "top" | "bottom";

/** What is being dragged right now (drives ghost + frame). */
type Manipulation = EditableLayer | "crop";

const CROP_SIDES: CropSide[] = ["top", "right", "bottom", "left"];

/** Faded copy of the photo outside the frame while it is moved or cropped. */
function ImageGhost({
  url,
  transform,
  scale,
}: {
  url: string;
  transform: LayerTransform;
  scale: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-0 origin-top-left"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        transform: `scale(${scale})`,
        opacity: 0.35,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain object-center"
        />
      </div>
    </div>
  );
}

type HandleDrag =
  | {
      kind: "image";
      /** Pinned point (opposite handle) in canvas units. */
      ax: number;
      ay: number;
      /** Unit vector from the pinned point towards the grabbed handle. */
      ux: number;
      uy: number;
      d0: number;
      origin: LayerTransform;
    }
  | {
      kind: "text";
      fx: number;
      fy: number;
      d0: number;
      origin: LayerTransform;
    }
  | {
      kind: "crop";
      side: CropSide;
      /** Uncropped photo bounds in canvas units. */
      left: number;
      top: number;
      width: number;
      height: number;
      aspect: number;
      origin: ImageCrop;
    };

/**
 * Handles around the selected layer (Canva-style).
 * Image: corners zoom with the opposite corner pinned; side handles crop.
 * Text: corners scale around the block's anchor.
 */
function SelectionOverlay({
  canvasRef,
  scale,
  slide,
  layer,
  showImageFrame,
  onImageTransform,
  onImageCrop,
  onTextTransform,
  onManipulate,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  scale: number;
  slide: Slide;
  layer: EditableLayer | null;
  /** Dashed outline of the whole photo (while moving/cropping). */
  showImageFrame: boolean;
  onImageTransform?: (transform: LayerTransform) => void;
  onImageCrop?: (crop: ImageCrop | null) => void;
  onTextTransform?: (transform: LayerTransform) => void;
  onManipulate: (kind: Manipulation | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const edgeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<HandleDrag | null>(null);
  const positionRef = useRef<() => void>(() => {});

  function imageElement() {
    return canvasRef.current?.querySelector<HTMLImageElement>(
      ".carousel-image-layer img",
    );
  }

  function textElement() {
    return canvasRef.current?.querySelector<HTMLElement>(".carousel-text-layer");
  }

  /** Photo bounds in canvas units: whole photo and its cropped (visible) part. */
  function imageBounds() {
    const img = imageElement();
    if (!img || !img.naturalWidth) return null;
    const size = containedImageSize(img.naturalWidth, img.naturalHeight);
    const t = slideImageTransform(slide);
    const w = size.width * t.scale;
    const h = size.height * t.scale;
    const full = {
      left: CANVAS_WIDTH / 2 + t.x - w / 2,
      top: CANVAS_HEIGHT / 2 + t.y - h / 2,
      width: w,
      height: h,
    };
    const crop = slideImageCrop(slide);
    const cropped = crop
      ? {
          left: full.left + crop.left * w,
          top: full.top + crop.top * h,
          width: w * (1 - crop.left - crop.right),
          height: h * (1 - crop.top - crop.bottom),
        }
      : full;
    return {
      full,
      cropped,
      crop,
      aspect: img.naturalWidth / img.naturalHeight,
    };
  }

  function toOverlay(b: { left: number; top: number; width: number; height: number }) {
    return {
      left: b.left * scale,
      top: b.top * scale,
      width: b.width * scale,
      height: b.height * scale,
    };
  }

  /** Bounds of the active layer in overlay pixels (may exceed the slide). */
  function measure() {
    const overlay = overlayRef.current;
    if (!overlay || !layer) return null;
    if (layer === "image") {
      const bounds = imageBounds();
      return bounds ? toOverlay(bounds.cropped) : null;
    }
    const el = textElement();
    if (!el) return null;
    const base = overlay.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      left: r.left - base.left,
      top: r.top - base.top,
      width: r.width,
      height: r.height,
    };
  }

  /** Handles sit on the visible part of the layer so they never leave the slide. */
  function handleBounds() {
    const bounds = measure();
    if (!bounds) return null;
    const maxW = CANVAS_WIDTH * scale;
    const maxH = CANVAS_HEIGHT * scale;
    const left = Math.max(0, bounds.left);
    const top = Math.max(0, bounds.top);
    const right = Math.min(maxW, bounds.left + bounds.width);
    const bottom = Math.min(maxH, bounds.top + bounds.height);
    if (right <= left || bottom <= top) return null;
    return { left, top, width: right - left, height: bottom - top };
  }

  function position() {
    const image = layer === "image" ? imageBounds() : null;
    const bounds = image ? toOverlay(image.full) : null;
    const visible = handleBounds();
    const frame = frameRef.current;
    if (frame) {
      frame.style.display =
        bounds && layer === "image" && showImageFrame ? "block" : "none";
      if (bounds) {
        frame.style.left = `${bounds.left}px`;
        frame.style.top = `${bounds.top}px`;
        frame.style.width = `${bounds.width}px`;
        frame.style.height = `${bounds.height}px`;
      }
    }
    CORNERS.forEach((corner, index) => {
      const handle = handleRefs.current[index];
      if (!handle) return;
      handle.style.display = visible ? "block" : "none";
      if (!visible) return;
      handle.style.left = `${visible.left + corner.x * visible.width - HANDLE_SIZE / 2}px`;
      handle.style.top = `${visible.top + corner.y * visible.height - HANDLE_SIZE / 2}px`;
    });
    CROP_SIDES.forEach((side, index) => {
      const handle = edgeRefs.current[index];
      if (!handle) return;
      handle.style.display = visible && layer === "image" ? "block" : "none";
      if (!visible) return;
      const horizontal = side === "top" || side === "bottom";
      const w = horizontal ? EDGE_HANDLE_LONG : EDGE_HANDLE_SHORT;
      const h = horizontal ? EDGE_HANDLE_SHORT : EDGE_HANDLE_LONG;
      const cx =
        side === "left"
          ? visible.left
          : side === "right"
            ? visible.left + visible.width
            : visible.left + visible.width / 2;
      const cy =
        side === "top"
          ? visible.top
          : side === "bottom"
            ? visible.top + visible.height
            : visible.top + visible.height / 2;
      handle.style.width = `${w}px`;
      handle.style.height = `${h}px`;
      handle.style.left = `${cx - w / 2}px`;
      handle.style.top = `${cy - h / 2}px`;
    });
  }

  // Imperative positioning keeps handles glued to the layer without re-renders.
  useLayoutEffect(() => {
    positionRef.current = position;
    position();
  });

  useEffect(() => {
    const reposition = () => positionRef.current();
    const observer = new ResizeObserver(reposition);
    const text = textElement();
    if (text) observer.observe(text);
    const img = imageElement();
    img?.addEventListener("load", reposition);
    window.addEventListener("resize", reposition);
    void document.fonts?.ready.then(reposition);
    return () => {
      observer.disconnect();
      img?.removeEventListener("load", reposition);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, slide.id, slideImageUrl(slide)]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>, corner: Corner) {
    if (!layer) return;
    e.preventDefault();
    e.stopPropagation();
    if (layer === "image") {
      const visible = handleBounds();
      if (!visible || !onImageTransform) return;
      // Canvas units: grabbed handle H and the opposite (pinned) handle A.
      const hx = (visible.left + corner.x * visible.width) / scale;
      const hy = (visible.top + corner.y * visible.height) / scale;
      const ax = (visible.left + (1 - corner.x) * visible.width) / scale;
      const ay = (visible.top + (1 - corner.y) * visible.height) / scale;
      const d0 = Math.max(1, Math.hypot(hx - ax, hy - ay));
      dragRef.current = {
        kind: "image",
        ax,
        ay,
        ux: (hx - ax) / d0,
        uy: (hy - ay) / d0,
        d0,
        origin: slideImageTransform(slide),
      };
    } else {
      const el = textElement();
      if (!el || !onTextTransform) return;
      const rect = el.getBoundingClientRect();
      const [originX = "50%", originY = "50%"] = getComputedStyle(el)
        .transformOrigin.split(" ");
      const fracX = el.offsetWidth ? parseFloat(originX) / el.offsetWidth : 0.5;
      const fracY = el.offsetHeight
        ? parseFloat(originY) / el.offsetHeight
        : 0.5;
      const fx = rect.left + fracX * rect.width;
      const fy = rect.top + fracY * rect.height;
      dragRef.current = {
        kind: "text",
        fx,
        fy,
        d0: Math.max(1, Math.hypot(e.clientX - fx, e.clientY - fy)),
        origin: normalizeTransform(slide.textTransform),
      };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    onManipulate(layer);
    lockPageSelection();
  }

  function onCropPointerDown(e: PointerEvent<HTMLDivElement>, side: CropSide) {
    if (layer !== "image" || !onImageCrop) return;
    e.preventDefault();
    e.stopPropagation();
    const bounds = imageBounds();
    if (!bounds) return;
    dragRef.current = {
      kind: "crop",
      side,
      ...bounds.full,
      aspect: bounds.aspect,
      origin: bounds.crop ?? {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        aspect: bounds.aspect,
      },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    onManipulate("crop");
    lockPageSelection();
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "crop") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Pointer as a fraction of the whole (uncropped) photo.
      const fx = ((e.clientX - rect.left) / scale - drag.left) / drag.width;
      const fy = ((e.clientY - rect.top) / scale - drag.top) / drag.height;
      const o = drag.origin;
      const max = (opposite: number) => Math.max(0, 1 - MIN_CROP_VISIBLE - opposite);
      const clamp = (value: number, opposite: number) =>
        Math.min(max(opposite), Math.max(0, value));
      const next: ImageCrop = { ...o, aspect: drag.aspect };
      if (drag.side === "left") next.left = clamp(fx, o.right);
      if (drag.side === "right") next.right = clamp(1 - fx, o.left);
      if (drag.side === "top") next.top = clamp(fy, o.bottom);
      if (drag.side === "bottom") next.bottom = clamp(1 - fy, o.top);
      onImageCrop?.(normalizeImageCrop(next));
      return;
    }
    if (drag.kind === "image") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) / scale;
      const py = (e.clientY - rect.top) / scale;
      // Distance along the diagonal → zoom factor; the pinned point stays put.
      const d = (px - drag.ax) * drag.ux + (py - drag.ay) * drag.uy;
      const s = clampLayerScale((drag.origin.scale * d) / drag.d0);
      const ratio = s / drag.origin.scale;
      const cx =
        drag.ax + (CANVAS_WIDTH / 2 + drag.origin.x - drag.ax) * ratio;
      const cy =
        drag.ay + (CANVAS_HEIGHT / 2 + drag.origin.y - drag.ay) * ratio;
      onImageTransform?.({
        x: cx - CANVAS_WIDTH / 2,
        y: cy - CANVAS_HEIGHT / 2,
        scale: s,
      });
      return;
    }
    const dist = Math.hypot(e.clientX - drag.fx, e.clientY - drag.fy);
    onTextTransform?.({
      ...drag.origin,
      scale: clampLayerScale((drag.origin.scale * dist) / drag.d0),
    });
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    onManipulate(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-hidden
    >
      <div
        ref={frameRef}
        className="absolute border border-dashed border-[var(--highlight)]"
        style={{ display: "none" }}
      />
      {layer
        ? CORNERS.map((corner, index) => (
            <div
              key={`${corner.x}-${corner.y}`}
              ref={(el) => {
                handleRefs.current[index] = el;
              }}
              className="pointer-events-auto absolute rounded-full border-2 border-[var(--highlight)] bg-white shadow"
              style={{
                display: "none",
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                cursor:
                  corner.x === corner.y ? "nwse-resize" : "nesw-resize",
                touchAction: "none",
              }}
              title={
                layer === "image" ? "Ziehen zum Zoomen" : "Ziehen zum Skalieren"
              }
              onPointerDown={(e) => onPointerDown(e, corner)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          ))
        : null}
      {layer === "image" && onImageCrop
        ? CROP_SIDES.map((side, index) => (
            <div
              key={side}
              ref={(el) => {
                edgeRefs.current[index] = el;
              }}
              className="pointer-events-auto absolute rounded-full border-2 border-[var(--highlight)] bg-white shadow"
              style={{
                display: "none",
                cursor:
                  side === "left" || side === "right"
                    ? "ew-resize"
                    : "ns-resize",
                touchAction: "none",
              }}
              title="Ziehen zum Zuschneiden"
              onPointerDown={(e) => onCropPointerDown(e, side)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          ))
        : null}
    </div>
  );
}

const HTML_EDIT_FIELDS = new Set(["bodyHtml", "quoteText"]);

function isHtmlEditField(slide: Slide, field: string) {
  return (
    HTML_EDIT_FIELDS.has(field) ||
    (slide.type === "outro" && field === "headline")
  );
}

/** Screen rect of a collapsed selection (falls back to a neighbouring char). */
function collapsedCaretRect(range: Range, editor: HTMLElement): DOMRect | null {
  const direct = Array.from(range.getClientRects()).find((r) => r.height > 0);
  if (direct) return direct;
  const node = range.startContainer;
  const offset = range.startOffset;
  if (node.nodeType === Node.TEXT_NODE) {
    const length = node.textContent?.length ?? 0;
    const probe = document.createRange();
    if (offset < length) {
      probe.setStart(node, offset);
      probe.setEnd(node, offset + 1);
      const r = probe.getClientRects()[0];
      if (r) return new DOMRect(r.left, r.top, 0, r.height);
    }
    if (offset > 0) {
      probe.setStart(node, offset - 1);
      probe.setEnd(node, offset);
      const r = probe.getClientRects()[0];
      if (r) return new DOMRect(r.right, r.top, 0, r.height);
    }
  } else if (node instanceof Element) {
    const child = node.childNodes[offset] ?? node.childNodes[offset - 1];
    if (child instanceof Element) {
      const r = child.getBoundingClientRect();
      if (r.height > 0) return new DOMRect(r.left, r.top, 0, r.height);
    }
  }
  // Empty editor: start of its first line.
  const box = editor.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
  const scaleY = editor.offsetHeight ? box.height / editor.offsetHeight : 1;
  const height = Number.isFinite(lineHeight)
    ? lineHeight * scaleY
    : Math.min(box.height, 24);
  return new DOMRect(box.left, box.top, 0, height);
}

/**
 * A crisp, blinking caret for inline editing. The browser's own caret lives
 * inside the scaled-down canvas and is drawn sub-pixel thin (often invisible).
 */
function InlineCaret({
  wrapperRef,
  canvasRef,
}: {
  wrapperRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
}) {
  const caretRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      const caret = caretRef.current;
      const wrapper = wrapperRef.current;
      const editor = canvasRef.current?.querySelector<HTMLElement>(
        "[contenteditable]",
      );
      const selection = window.getSelection();
      if (!caret || !wrapper || !editor) return;
      const range =
        selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const show =
        range !== null &&
        range.collapsed &&
        document.activeElement === editor &&
        editor.contains(range.startContainer);
      if (!show) {
        caret.style.display = "none";
        return;
      }
      const rect = collapsedCaretRect(range, editor);
      if (!rect) {
        caret.style.display = "none";
        return;
      }
      const base = wrapper.getBoundingClientRect();
      caret.style.display = "block";
      caret.style.left = `${rect.left - base.left - 1}px`;
      caret.style.top = `${rect.top - base.top}px`;
      caret.style.height = `${Math.max(rect.height, 8)}px`;
      caret.style.backgroundColor = getComputedStyle(editor).color;
      // Restart blinking so the caret is solid right after it moves.
      caret.style.animation = "none";
      void caret.offsetWidth;
      caret.style.animation = "";
    }
    update();
    document.addEventListener("selectionchange", update);
    document.addEventListener("input", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("input", update, true);
      window.removeEventListener("resize", update);
    };
  }, [wrapperRef, canvasRef]);

  return (
    <div
      ref={caretRef}
      aria-hidden
      className="carousel-inline-caret pointer-events-none absolute z-[3] w-[2px] rounded-full"
      style={{ display: "none" }}
    />
  );
}

/** Floating B / I / Fertig while a text field is edited on the canvas. */
function InlineEditToolbar({ html }: { html: boolean }) {
  const button =
    "pointer-events-auto rounded-md px-2 py-1 text-xs font-semibold text-[var(--fg)] hover:bg-[var(--bg)]";
  return (
    <div
      className="pointer-events-auto absolute right-2 top-2 z-[3] flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5 shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      {html ? (
        <>
          <button
            type="button"
            className={`${button} font-bold`}
            title="Fett (⌘B)"
            onClick={() => document.execCommand("bold")}
          >
            B
          </button>
          <button
            type="button"
            className={`${button} italic`}
            title="Kursiv (⌘I)"
            onClick={() => document.execCommand("italic")}
          >
            I
          </button>
        </>
      ) : null}
      <button
        type="button"
        className={button}
        title="Bearbeiten beenden (Esc)"
        onClick={() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
        }}
      >
        Fertig
      </button>
    </div>
  );
}

export function CarouselSlidePreview({
  slide,
  scale = 0.35,
  forExport = false,
  interactive = false,
  selectedLayer = null,
  onSelectLayer,
  onImageTransform,
  onTextTransform,
  onTextChange,
  onImageCrop,
  format,
}: {
  slide: Slide;
  scale?: number;
  forExport?: boolean;
  /** Enables side handles that crop the background photo. */
  onImageCrop?: (crop: ImageCrop | null) => void;
  /** Enables double-click text editing directly on the canvas. */
  onTextChange?: (patch: Partial<Slide>) => void;
} & InteractiveProps) {
  const [guides, setGuides] = useState<{
    v: number | null;
    h: number | null;
  }>({ v: null, h: null });
  const [editing, setEditing] = useState<{
    slideId: string;
    field: string;
    point: { x: number; y: number } | null;
  } | null>(null);
  const [manipulating, setManipulating] = useState<Manipulation | null>(
    null,
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editable = interactive && !forExport;
  const editingField =
    editable && editing?.slideId === slide.id ? editing.field : null;

  const shared = {
    interactive: interactive && !forExport,
    selectedLayer,
    onSelectLayer,
    onImageTransform,
    onTextTransform,
    previewScale: scale,
    format,
    onGuides: setGuides,
  };

  function handleDoubleClick(e: MouseEvent<HTMLDivElement>) {
    if (!onTextChange || editingField) return;
    const canvas = canvasRef.current;
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find(
        (el): el is HTMLElement =>
          el instanceof HTMLElement &&
          Boolean(el.dataset.editField) &&
          Boolean(canvas?.contains(el)),
      );
    if (!hit?.dataset.editField) return;
    e.preventDefault();
    onSelectLayer?.("text");
    setEditing({
      slideId: slide.id,
      field: hit.dataset.editField,
      point: { x: e.clientX, y: e.clientY },
    });
  }

  const canvas = (
    <div
      lang="de"
      data-carousel-canvas={forExport ? "true" : undefined}
      className={[
        "relative shrink-0 overflow-hidden",
        carouselFont.variable,
        instrumentSans.variable,
        gtSectra.variable,
        forExport ? "" : "shadow-lg ring-1 ring-black/10",
        editable ? "z-[1]" : "",
      ].join(" ")}
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
      }}
    >
      <div
        ref={canvasRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          fontFamily: CAROUSEL_FONT,
          // Own alignment so thumbnails inside <button> (text-align: center)
          // render exactly like the editor canvas and the PNG export.
          textAlign: "left",
        }}
        onDoubleClick={editable && onTextChange ? handleDoubleClick : undefined}
      >
        {slide.type === "cover" ? (
          <CoverPreview slide={slide} {...shared} />
        ) : null}
        {slide.type === "text" ? (
          <TextPreview slide={slide} {...shared} />
        ) : null}
        {slide.type === "quote" ? (
          <QuotePreview slide={slide} {...shared} />
        ) : null}
        {slide.type === "frage" ? (
          <FragePreview slide={slide} {...shared} />
        ) : null}
        {slide.type === "tipp-item" ? (
          <TippItemPreview slide={slide} format={format} />
        ) : null}
        {slide.type === "outro" ? (
          <OutroPreview slide={slide} {...shared} />
        ) : null}
        {interactive && !forExport ? (
          <Guides vertical={guides.v} horizontal={guides.h} />
        ) : null}
      </div>
    </div>
  );

  if (!editable) return canvas;

  const imageUrl = slideImageUrl(slide);
  // A cropped photo moves as its visible part only — no faded rest around it.
  const imageCropped = Boolean(imageUrl && slideImageCrop(slide));
  const overlayLayer: EditableLayer | null = editingField
    ? null
    : selectedLayer === "image" && imageUrl
      ? "image"
      : selectedLayer === "text" && slide.type !== "tipp-item"
        ? "text"
        : null;

  return (
    <CanvasEditContext.Provider
      value={{
        editingField,
        caretPoint: editing?.point ?? null,
        onFieldChange: onTextChange
          ? (field, value) =>
              onTextChange({ [field]: value } as Partial<Slide>)
          : undefined,
        stopEditing: () => setEditing(null),
        setManipulating,
      }}
    >
      <div
        ref={wrapperRef}
        className="relative shrink-0 select-none"
        style={{
          width: CANVAS_WIDTH * scale,
          height: CANVAS_HEIGHT * scale,
        }}
      >
        {manipulating === "image" && imageUrl && !imageCropped ? (
          <ImageGhost
            url={imageUrl}
            transform={slideImageTransform(slide)}
            scale={scale}
          />
        ) : null}
        {canvas}
        {manipulating === "crop" && imageUrl ? (
          // While cropping, the cut-away parts stay faintly visible on top.
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <ImageGhost
              url={imageUrl}
              transform={slideImageTransform(slide)}
              scale={scale}
            />
          </div>
        ) : null}
        <SelectionOverlay
          canvasRef={canvasRef}
          scale={scale}
          slide={slide}
          layer={overlayLayer}
          showImageFrame={
            (manipulating === "image" && !imageCropped) ||
            manipulating === "crop"
          }
          onImageTransform={onImageTransform}
          onImageCrop={onImageCrop}
          onTextTransform={onTextTransform}
          onManipulate={setManipulating}
        />
        {editingField ? (
          <>
            <InlineEditToolbar html={isHtmlEditField(slide, editingField)} />
            <InlineCaret wrapperRef={wrapperRef} canvasRef={canvasRef} />
          </>
        ) : null}
      </div>
    </CanvasEditContext.Provider>
  );
}
