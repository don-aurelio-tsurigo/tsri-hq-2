"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  inkCssColor,
  resolveSlideInk,
  type SlideInk,
} from "@/lib/carousel/categories";
import { carouselFont, instrumentSans } from "@/lib/carousel/fonts";
import {
  GT_SECTRA_STACK,
  INSTRUMENT_SANS_STACK,
  SIXIBRIEF_BAR,
  SIXIBRIEF_BAR_HEIGHT,
} from "@/lib/carousel/sixibrief";
import {
  defaultImageOverlayForSlideType,
  imageDimFilter,
  imageOverlayGradient,
  normalizeImageOverlay,
} from "@/lib/carousel/overlay";
import {
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
  TIPP_TEAL,
  type EditableLayer,
  type ImageOverlay,
  type LayerTransform,
  type Slide,
} from "@/lib/carousel/types";
import type { CarouselFormat } from "@/lib/carousel/format";

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

function CalendarIcon() {
  return (
    <span
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-0.18em" }}
      dangerouslySetInnerHTML={{ __html: CALENDAR_ICON_SVG }}
    />
  );
}

export function sanitizeSlideHtml(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;i&gt;/gi, "<i>")
    .replace(/&lt;\/i&gt;/gi, "</i>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
    .replace(/\n/g, "<br/>");
}

function slideHtml(input: string): string {
  return sanitizeSlideHtml(input).replace(CALENDAR_EMOJI_RE, CALENDAR_ICON_SVG);
}

function Category({ text, ink = "light" }: { text: string; ink?: SlideInk }) {
  return (
    <p
      className="pointer-events-none absolute left-0 right-0 z-20 text-center font-medium tracking-[0.18em] uppercase"
      style={{
        top: 72,
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

function BrandMark({ ink = "light" }: { ink?: SlideInk }) {
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 flex justify-center"
      style={{ bottom: 56 }}
    >
      <img
        src={BRAND_LOGO_SRC}
        alt={BRAND_MARK}
        width={220}
        height={72}
        className="object-contain object-center"
        style={{
          width: 220,
          height: 72,
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
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  url: string | null;
  transform: LayerTransform;
  overlay?: Partial<ImageOverlay> | null;
  overlayDefaults?: ImageOverlay;
  className?: string;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const t = normalizeTransform(transform);
  const o = normalizeImageOverlay(overlay, overlayDefaults);
  return (
    <div
      className={`absolute inset-0 z-0 overflow-hidden ${className ?? ""}`}
      style={{
        backgroundColor: "#1a1a1a",
        transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
        transformOrigin: "center center",
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

type InteractiveProps = {
  interactive?: boolean;
  selectedLayer?: EditableLayer | null;
  onSelectLayer?: (layer: EditableLayer) => void;
  onImageTransform?: (transform: LayerTransform) => void;
  onTextTransform?: (transform: LayerTransform) => void;
  previewScale?: number;
  format?: CarouselFormat;
};

function useLayerDrag({
  enabled,
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
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    className: [
      enabled ? "cursor-grab active:cursor-grabbing" : "",
      selected && enabled ? "outline outline-2 outline-[var(--highlight)]" : "",
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
        {slide.overline ? (
          isTipp ? (
            <p
              className="inline-block font-medium"
              style={{
                fontSize: 28,
                lineHeight: 1.2,
                marginBottom: 28,
                backgroundColor: "#ffffff",
                color: TIPP_TEAL,
                padding: "10px 18px",
              }}
            >
              {slide.overline}
            </p>
          ) : (
            <p
              className="font-normal"
              style={{
                fontSize: isSixi ? 32 : 35,
                lineHeight: 1.2,
                marginBottom: isSixi ? 18 : 40,
                fontFamily: isSixi ? INSTRUMENT_SANS_STACK : undefined,
                fontWeight: isSixi ? 400 : undefined,
              }}
            >
              {slide.overline}
            </p>
          )
        ) : null}
        <p
          className={isSixi ? "font-medium" : "font-bold"}
          style={{
            fontSize: isSixi ? 64 : 68,
            lineHeight: isSixi ? 1.08 : 1.12,
            fontWeight: isSixi ? 500 : undefined,
            whiteSpace: isTipp || isSixi ? "pre-wrap" : undefined,
          }}
        >
          {slide.headline || "Headline…"}
        </p>
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
      <div
        className={`carousel-slide-text absolute z-30 overflow-hidden ${isSixi ? "sixibrief-text" : ""} ${textDrag.className}`}
        style={{
          left: isSixi ? 80 : 100,
          right: isSixi ? 80 : 100,
          top: isSixi ? 88 : 200,
          bottom: isSixi ? 80 : 180,
          fontSize: isSixi ? 40 : 53.4,
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
        dangerouslySetInnerHTML={{
          __html:
            slideHtml(slide.bodyHtml) ||
            "<span style='opacity:0.55'>Text…</span>",
        }}
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
        <p
          className="carousel-slide-text font-bold"
          style={{
            fontSize: 53.4,
            lineHeight: 1.25,
            whiteSpace: "pre-wrap",
            ...SLIDE_TEXT_HYPHENS,
          }}
          dangerouslySetInnerHTML={{
            __html: (() => {
              const raw = slide.quoteText || "Zitat…";
              const html = slideHtml(raw);
              const plain = raw.replace(/<[^>]+>/g, "");
              if (plain.trimEnd().endsWith("»")) return html;
              return `${html}»`;
            })(),
          }}
        />
        {slide.attribution ? (
          <p
            className="font-normal opacity-95"
            style={{ fontSize: 40.05, lineHeight: 1.2, marginTop: 52 }}
          >
            {slide.attribution}
          </p>
        ) : null}
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
              {item.title || "Wochentag: Thema."}
            </p>
            <p
              className="font-normal"
              style={{ fontSize: 40, lineHeight: 1.25, marginTop: 16 }}
            >
              {item.body || "Termintext…"}
            </p>
            {item.meta ? (
              <p
                className="font-normal"
                style={{ fontSize: 36, lineHeight: 1.2, marginTop: 16 }}
              >
                <CalendarIcon />
                {withCalendarEmoji(item.meta).text}
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
        <p
          className={isSixi ? "font-medium" : "font-bold"}
          style={{
            fontSize: isSixi ? 58 : 76,
            lineHeight: isSixi ? 1.28 : 1.32,
            fontWeight: isSixi ? 500 : undefined,
            whiteSpace: "pre-wrap",
          }}
        >
          {slide.headline || "Headline…"}
        </p>
        {isSixi ? null : (
          <p
            className="text-right font-medium tracking-[0.08em] uppercase"
            style={{
              fontSize: 40,
              lineHeight: 1.2,
              marginTop: 28,
              fontFamily: CAROUSEL_FONT,
            }}
          >
            {slide.ctaText || "LINK IN DER BIO"}
          </p>
        )}
      </div>
      {isSixi ? (
        <p
          className="absolute z-30 font-bold"
          style={{
            left: 80,
            bottom: 72,
            fontSize: 32,
            lineHeight: 1.2,
            fontFamily: INSTRUMENT_SANS_STACK,
            fontWeight: 700,
            color: inkColor,
          }}
        >
          {slide.ctaText || "→ Link in der Bio"}
        </p>
      ) : (
        <BrandMark ink={ink} />
      )}
    </>
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
  format,
}: {
  slide: Slide;
  scale?: number;
  forExport?: boolean;
} & InteractiveProps) {
  const [guides, setGuides] = useState<{
    v: number | null;
    h: number | null;
  }>({ v: null, h: null });

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

  return (
    <div
      lang="de"
      data-carousel-canvas={forExport ? "true" : undefined}
      className={[
        "relative shrink-0 overflow-hidden",
        carouselFont.variable,
        instrumentSans.variable,
        forExport ? "" : "shadow-lg ring-1 ring-black/10",
      ].join(" ")}
      style={{
        width: CANVAS_WIDTH * scale,
        height: CANVAS_HEIGHT * scale,
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          fontFamily: CAROUSEL_FONT,
        }}
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
}
