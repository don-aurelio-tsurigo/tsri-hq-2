"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  inkCssColor,
  resolveSlideInk,
  type SlideInk,
} from "@/lib/carousel/categories";
import { carouselFont } from "@/lib/carousel/fonts";
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
  type EditableLayer,
  type ImageOverlay,
  type LayerTransform,
  type Slide,
} from "@/lib/carousel/types";

const CAROUSEL_FONT =
  "var(--font-carousel), 'Roboto', system-ui, sans-serif";

const SLIDE_TEXT_HYPHENS: CSSProperties = {
  hyphens: "auto",
  WebkitHyphens: "auto",
};

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
  onGuides,
}: {
  slide: Extract<Slide, { type: "cover" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const imageT = normalizeImageTransform(slide.imageTransform);
  const textT = normalizeTransform(slide.textTransform);
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
        hasImage={Boolean(slide.backgroundImageUrl)}
        overlay={slide.imageOverlay}
      />
      <Category text={slide.category} ink="light" />
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: 88,
          right: 88,
          bottom: 220,
          fontFamily: CAROUSEL_FONT,
          color: inkCssColor("light"),
          ...textTransformStyle(textT, "left bottom"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        {slide.overline ? (
          <p
            className="font-normal"
            style={{ fontSize: 35, lineHeight: 1.2, marginBottom: 40 }}
          >
            {slide.overline}
          </p>
        ) : null}
        <p className="font-bold" style={{ fontSize: 68, lineHeight: 1.12 }}>
          {slide.headline || "Headline…"}
        </p>
      </div>
      <BrandMark ink="light" />
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
  onGuides,
}: {
  slide: Extract<Slide, { type: "text" }>;
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
      <Category text={slide.category} ink={ink} />
      <div
        className={`carousel-slide-text absolute z-30 overflow-hidden ${textDrag.className}`}
        style={{
          left: 100,
          right: 100,
          top: 200,
          bottom: 180,
          fontSize: 60,
          lineHeight: 1.05,
          fontFamily: CAROUSEL_FONT,
          fontWeight: 400,
          color: inkColor,
          ...SLIDE_TEXT_HYPHENS,
          ...textTransformStyle(textT, "center top"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
        dangerouslySetInnerHTML={{
          __html:
            sanitizeSlideHtml(slide.bodyHtml) ||
            "<span style='opacity:0.55'>Text…</span>",
        }}
      />
      <BrandMark ink={ink} />
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
      <Category text={slide.category} ink={ink} />
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
            fontSize: 60,
            lineHeight: 1.25,
            whiteSpace: "pre-wrap",
            ...SLIDE_TEXT_HYPHENS,
          }}
          dangerouslySetInnerHTML={{
            __html: (() => {
              const raw = slide.quoteText || "Zitat…";
              const html = sanitizeSlideHtml(raw);
              const plain = raw.replace(/<[^>]+>/g, "");
              if (plain.trimEnd().endsWith("»")) return html;
              return `${html}»`;
            })(),
          }}
        />
        {slide.attribution ? (
          <p
            className="font-normal opacity-95"
            style={{ fontSize: 45, lineHeight: 1.2, marginTop: 52 }}
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
}: {
  slide: Extract<Slide, { type: "tipp-item" }>;
}) {
  const ink = resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
      />
      <div
        className="carousel-slide-text absolute z-30 overflow-hidden"
        style={{
          left: 100,
          right: 100,
          top: 160,
          bottom: 180,
          fontFamily: CAROUSEL_FONT,
          color: inkColor,
          ...SLIDE_TEXT_HYPHENS,
        }}
      >
        {slide.items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            style={{ marginBottom: index === slide.items.length - 1 ? 0 : 48 }}
          >
            <p className="font-bold" style={{ fontSize: 48, lineHeight: 1.15 }}>
              {item.title || "Wochentag: Thema."}
            </p>
            <p
              className="font-normal"
              style={{ fontSize: 36, lineHeight: 1.25, marginTop: 16 }}
            >
              {item.body || "Termintext…"}
            </p>
            {item.meta ? (
              <p
                className="font-normal opacity-90"
                style={{ fontSize: 32, lineHeight: 1.2, marginTop: 16 }}
              >
                {item.meta}
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
  onGuides,
}: {
  slide: Extract<Slide, { type: "outro" }>;
} & InteractiveProps & {
    onGuides?: (guides: { v: number | null; h: number | null }) => void;
  }) {
  const ink = resolveSlideInk(slide);
  const inkColor = inkCssColor(ink);
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
      <Category text={slide.category} ink={ink} />
      <div
        className={`absolute z-30 ${textDrag.className}`}
        style={{
          left: 88,
          right: 88,
          top: "42%",
          fontFamily: CAROUSEL_FONT,
          color: inkColor,
          ...textTransformStyle(
            {
              ...textT,
              // preserve vertical centering of the block, then apply offsets
              x: textT.x,
              y: textT.y,
            },
            "center center",
          ),
          transform: `translateY(-50%) translate(${textT.x}px, ${textT.y}px) scale(${textT.scale})`,
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        <p className="font-bold" style={{ fontSize: 76, lineHeight: 1.32 }}>
          {slide.headline || "Headline…"}
        </p>
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
      </div>
      <BrandMark ink={ink} />
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
    onGuides: setGuides,
  };

  return (
    <div
      lang="de"
      data-carousel-canvas={forExport ? "true" : undefined}
      className={[
        "relative shrink-0 overflow-hidden",
        carouselFont.variable,
        carouselFont.className,
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
          <TippItemPreview slide={slide} />
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
