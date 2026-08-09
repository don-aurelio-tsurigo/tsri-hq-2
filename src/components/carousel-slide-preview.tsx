import {
  BRAND_LOGO_SRC,
  BRAND_MARK,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_BG,
  type Slide,
} from "@/lib/carousel/types";

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
      className="absolute left-0 right-0 text-center font-medium tracking-[0.18em] text-white uppercase"
      style={{
        top: 72,
        fontSize: 28,
        fontFamily: "var(--font-body), system-ui, sans-serif",
      }}
    >
      {text || "STADTLEBEN"}
    </p>
  );
}

function BrandMark() {
  return (
    <div
      className="absolute left-0 right-0 flex justify-center"
      style={{ bottom: 56 }}
    >
      {/* Logo is dark; invert to white for gold/photo Instagram backgrounds */}
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

function BgImage({
  url,
  overlay,
}: {
  url: string | null;
  overlay?: boolean;
}) {
  return (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundColor: "#1a1a1a",
          backgroundImage: url ? `url(${url})` : undefined,
        }}
      />
      {overlay || !url ? (
        <div
          className="absolute inset-0"
          style={{
            background: url
              ? "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.55) 100%)"
              : "linear-gradient(180deg, #2a2a2a 0%, #111 100%)",
          }}
        />
      ) : null}
    </>
  );
}

function CoverPreview({ slide }: { slide: Extract<Slide, { type: "cover" }> }) {
  return (
    <>
      <BgImage url={slide.backgroundImageUrl} overlay />
      <Category text={slide.category} />
      <div
        className="absolute text-white"
        style={{
          left: 88,
          right: 88,
          bottom: 220,
          fontFamily: "var(--font-display), system-ui, sans-serif",
        }}
      >
        {slide.overline ? (
          <p className="mb-3 font-medium" style={{ fontSize: 36 }}>
            {slide.overline}
          </p>
        ) : null}
        <p className="font-extrabold leading-[1.12]" style={{ fontSize: 56 }}>
          {slide.headline || "Headline…"}
        </p>
      </div>
      <BrandMark />
    </>
  );
}

function TextPreview({ slide }: { slide: Extract<Slide, { type: "text" }> }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
      />
      <Category text={slide.category} />
      <div
        className="absolute overflow-hidden text-white"
        style={{
          left: 100,
          right: 100,
          top: 200,
          bottom: 180,
          fontSize: 40,
          lineHeight: 1.35,
          fontFamily: "var(--font-body), system-ui, sans-serif",
          fontWeight: 500,
        }}
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

function QuotePreview({ slide }: { slide: Extract<Slide, { type: "quote" }> }) {
  const hasImage = Boolean(slide.backgroundImageUrl);
  return (
    <>
      {hasImage ? (
        <BgImage url={slide.backgroundImageUrl} overlay />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
        />
      )}
      <Category text={slide.category} />
      <div
        className="absolute text-white"
        style={{
          left: 100,
          right: 100,
          top: 220,
          bottom: 180,
          fontFamily: "var(--font-body), system-ui, sans-serif",
        }}
      >
        <p
          className="font-extrabold leading-none"
          style={{ fontSize: 120, marginBottom: 24 }}
        >
          «
        </p>
        <p
          className="font-extrabold leading-[1.25]"
          style={{ fontSize: 40, whiteSpace: "pre-wrap" }}
        >
          {slide.quoteText || "Zitat…"}
          {slide.quoteText && !slide.quoteText.trimEnd().endsWith("»")
            ? "»"
            : ""}
        </p>
        {slide.attribution ? (
          <p className="mt-8 font-medium opacity-95" style={{ fontSize: 30 }}>
            {slide.attribution}
          </p>
        ) : null}
      </div>
      <BrandMark />
    </>
  );
}

function OutroPreview({ slide }: { slide: Extract<Slide, { type: "outro" }> }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{ backgroundColor: slide.backgroundColor || DEFAULT_BG }}
      />
      <Category text={slide.category} />
      <div
        className="absolute text-white"
        style={{
          left: 88,
          right: 88,
          top: "42%",
          transform: "translateY(-50%)",
          fontFamily: "var(--font-display), system-ui, sans-serif",
        }}
      >
        <p className="font-extrabold leading-[1.15]" style={{ fontSize: 56 }}>
          {slide.headline || "Headline…"}
        </p>
        <p
          className="mt-8 text-right font-semibold tracking-[0.08em] uppercase"
          style={{
            fontSize: 32,
            fontFamily: "var(--font-body), system-ui, sans-serif",
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
}: {
  slide: Slide;
  scale?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden shadow-lg ring-1 ring-black/10"
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
        }}
      >
        {slide.type === "cover" ? <CoverPreview slide={slide} /> : null}
        {slide.type === "text" ? <TextPreview slide={slide} /> : null}
        {slide.type === "quote" ? <QuotePreview slide={slide} /> : null}
        {slide.type === "outro" ? <OutroPreview slide={slide} /> : null}
      </div>
    </div>
  );
}
