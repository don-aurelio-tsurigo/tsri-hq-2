"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { carouselFont } from "@/lib/carousel/fonts";
import {
  imageDimFilter,
  imageOverlayGradient,
  normalizeImageOverlay,
} from "@/lib/carousel/overlay";
import {
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

export function sanitizeSlideHtml(input: string): string {
  const escaped = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
    .replace(/\n/g, "<br/>");
}

function Category({ text }: { text: string }) {
  return (
    <p
      className="pointer-events-none absolute left-0 right-0 z-20 text-center font-medium tracking-[0.18em] text-white uppercase"
      style={{
        top: 72,
        fontSize: 30,
        lineHeight: 1.2,
        fontFamily: CAROUSEL_FONT,
      }}
    >
      {text || "STADTLEBEN"}
    </p>
  );
}

function BrandMark() {
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
          filter: "brightness(0) invert(1)",
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

function imageStyle(
  url: string | null,
  transform: LayerTransform,
  overlay?: Partial<ImageOverlay> | null,
): CSSProperties {
  const t = normalizeTransform(transform);
  const o = normalizeImageOverlay(overlay);
  return {
    backgroundColor: "#1a1a1a",
    backgroundImage: url ? `url(${url})` : undefined,
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    backgroundPosition: "center",
    transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
    transformOrigin: "center center",
    filter: url ? imageDimFilter(o.dim) : undefined,
  };
}

function ImageScrim({
  hasImage,
  overlay,
  fallback,
}: {
  hasImage: boolean;
  overlay?: Partial<ImageOverlay> | null;
  fallback?: string;
}) {
  const o = normalizeImageOverlay(overlay);
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
  const imageT = normalizeTransform(slide.imageTransform);
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
      <div
        className={`absolute inset-0 z-0 ${imageDrag.className}`}
        style={imageStyle(slide.backgroundImageUrl, imageT, slide.imageOverlay)}
        onPointerDown={imageDrag.onPointerDown}
        onPointerMove={imageDrag.onPointerMove}
        onPointerUp={imageDrag.onPointerUp}
      />
      <ImageScrim
        hasImage={Boolean(slide.backgroundImageUrl)}
        overlay={slide.imageOverlay}
      />
      <Category text={slide.category} />
      <div
        className={`absolute z-30 text-white ${textDrag.className}`}
        style={{
          left: 88,
          right: 88,
          bottom: 220,
          fontFamily: CAROUSEL_FONT,
          ...textTransformStyle(textT, "left bottom"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        {slide.overline ? (
          <p className="mb-3 font-medium" style={{ fontSize: 30, lineHeight: 1.2 }}>
            {slide.overline}
          </p>
        ) : null}
        <p className="font-extrabold" style={{ fontSize: 54, lineHeight: 1.2 }}>
          {slide.headline || "Headline…"}
        </p>
      </div>
      <BrandMark />
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
  const imageT = normalizeTransform(slide.imageTransform);
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
          <div
            className={`absolute inset-0 z-0 ${imageDrag.className}`}
            style={imageStyle(
              slide.backgroundImageUrl,
              imageT,
              slide.imageOverlay,
            )}
            onPointerDown={imageDrag.onPointerDown}
            onPointerMove={imageDrag.onPointerMove}
            onPointerUp={imageDrag.onPointerUp}
          />
          <ImageScrim hasImage overlay={slide.imageOverlay} />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <Category text={slide.category} />
      <div
        className={`absolute z-30 overflow-hidden text-white ${textDrag.className}`}
        style={{
          left: 100,
          right: 100,
          top: 200,
          bottom: 180,
          fontSize: 60,
          lineHeight: 1.05,
          fontFamily: CAROUSEL_FONT,
          fontWeight: 400,
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
      <BrandMark />
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
  const imageT = normalizeTransform(slide.imageTransform);
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
          <div
            className={`absolute inset-0 z-0 ${imageDrag.className}`}
            style={imageStyle(
              slide.backgroundImageUrl,
              imageT,
              slide.imageOverlay,
            )}
            onPointerDown={imageDrag.onPointerDown}
            onPointerMove={imageDrag.onPointerMove}
            onPointerUp={imageDrag.onPointerUp}
          />
          <ImageScrim hasImage overlay={slide.imageOverlay} />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <Category text={slide.category} />
      <div
        className={`absolute z-30 text-white ${textDrag.className}`}
        style={{
          left: 100,
          right: 100,
          top: 220,
          bottom: 180,
          fontFamily: CAROUSEL_FONT,
          ...textTransformStyle(textT, "left top"),
        }}
        onPointerDown={textDrag.onPointerDown}
        onPointerMove={textDrag.onPointerMove}
        onPointerUp={textDrag.onPointerUp}
      >
        <p
          className="font-extrabold leading-none"
          style={{ fontSize: 181, marginBottom: 24 }}
        >
          «
        </p>
        <p
          className="font-extrabold"
          style={{ fontSize: 40, lineHeight: 1.4, whiteSpace: "pre-wrap" }}
        >
          {slide.quoteText || "Zitat…"}
          {slide.quoteText && !slide.quoteText.trimEnd().endsWith("»")
            ? "»"
            : ""}
        </p>
        {slide.attribution ? (
          <p
            className="mt-8 font-medium opacity-95"
            style={{ fontSize: 30, lineHeight: 1.2 }}
          >
            {slide.attribution}
          </p>
        ) : null}
      </div>
      <BrandMark />
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
      <Category text={slide.category} />
      <div
        className={`absolute z-30 text-white ${textDrag.className}`}
        style={{
          left: 88,
          right: 88,
          top: "42%",
          fontFamily: CAROUSEL_FONT,
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
        <p className="font-extrabold" style={{ fontSize: 54, lineHeight: 1.2 }}>
          {slide.headline || "Headline…"}
        </p>
        <p
          className="mt-8 text-right font-semibold tracking-[0.08em] uppercase"
          style={{
            fontSize: 32,
            lineHeight: 1.2,
            fontFamily: CAROUSEL_FONT,
          }}
        >
          {slide.ctaText || "LINK IN DER BIO"}
        </p>
      </div>
      <BrandMark />
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
