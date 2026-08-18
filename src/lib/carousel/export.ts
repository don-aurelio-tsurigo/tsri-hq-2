"use client";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import {
  BRAND_LOGO_SRC,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TIPP_LOGO_TEAL_SRC,
  TIPP_LOGO_WHITE_SRC,
  type Slide,
} from "@/lib/carousel/types";
import type { CarouselFormat } from "@/lib/carousel/format";
import { SIXIBRIEF_LOGO_SRC } from "@/lib/carousel/sixibrief";

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "carousel";
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
}

/** Inline remote/same-origin images so html-to-image never needs CORS re-fetch. */
async function inlineImageUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;

  const tryFetch = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && !src.startsWith("blob:")) {
      // some servers omit type; still try
    }
    return blobToDataUrl(blob);
  };

  try {
    return await tryFetch(src);
  } catch {
    if (src.startsWith("blob:") || src.startsWith("/")) {
      throw new Error(`Bild konnte nicht geladen werden: ${src.slice(0, 80)}`);
    }
    const proxy = `/api/carousel/proxy-image?url=${encodeURIComponent(src)}`;
    return await tryFetch(proxy);
  }
}

async function prepareSlideForExport(slide: Slide): Promise<Slide> {
  if (
    slide.type !== "cover" &&
    slide.type !== "text" &&
    slide.type !== "quote"
  ) {
    return slide;
  }
  if (!slide.backgroundImageUrl) return slide;
  const backgroundImageUrl = await inlineImageUrl(slide.backgroundImageUrl);
  return { ...slide, backgroundImageUrl };
}

function slideImageUrls(slide: Slide, format: CarouselFormat): string[] {
  const urls = [BRAND_LOGO_SRC];
  if (format === "tsueritipp") {
    urls.push(TIPP_LOGO_WHITE_SRC, TIPP_LOGO_TEAL_SRC);
  }
  if (format === "6ibrief") {
    urls.push(SIXIBRIEF_LOGO_SRC);
  }
  if (
    (slide.type === "cover" ||
      slide.type === "text" ||
      slide.type === "quote") &&
    slide.backgroundImageUrl
  ) {
    urls.push(slide.backgroundImageUrl);
  }
  return urls;
}

function preloadImage(src: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    if (!src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

async function waitForAssets(slide: Slide, format: CarouselFormat) {
  await document.fonts.ready;
  await Promise.all(slideImageUrls(slide, format).map(preloadImage));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportAllCarouselSlides(
  slides: Slide[],
  title: string,
  onProgress?: (done: number, total: number) => void,
  format: CarouselFormat = "standard",
) {
  if (slides.length === 0) {
    throw new Error("Keine Slides zum Exportieren.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Keep real canvas size off-screen — 0×0 hosts break image layout/export.
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;overflow:hidden;pointer-events:none;`;
  document.body.appendChild(host);

  let root: Root | null = createRoot(host);
  const zip = new JSZip();

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = await prepareSlideForExport(slides[i]!);
      flushSync(() => {
        root!.render(
          createElement(CarouselSlidePreview, {
            slide,
            scale: 1,
            forExport: true,
            format,
          }),
        );
      });

      const node = host.querySelector(
        "[data-carousel-canvas]",
      ) as HTMLElement | null;
      if (!node) {
        throw new Error(`Slide ${i + 1} konnte nicht gerendert werden.`);
      }

      await waitForAssets(slide, format);

      const dataUrl = await toPng(node, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        pixelRatio: 1,
        // cacheBust appends ?t=… and breaks data: URLs / some CDNs
        cacheBust: false,
        style: {
          transform: "none",
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
        },
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const name = `slide-${String(i + 1).padStart(2, "0")}.png`;
      zip.file(name, blob);
      onProgress?.(i + 1, slides.length);
    }

    const archive = await zip.generateAsync({ type: "blob" });
    downloadBlob(archive, `${slugify(title)}-slides.zip`);
  } finally {
    flushSync(() => {
      root?.render(null);
    });
    root?.unmount();
    root = null;
    host.remove();
  }
}
