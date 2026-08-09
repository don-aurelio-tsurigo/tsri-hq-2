"use client";

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { CarouselSlidePreview } from "@/components/carousel-slide-preview";
import { BRAND_LOGO_SRC, CANVAS_HEIGHT, CANVAS_WIDTH, type Slide } from "@/lib/carousel/types";

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

function slideImageUrls(slide: Slide): string[] {
  const urls = [BRAND_LOGO_SRC];
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
    img.crossOrigin = "anonymous";
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

async function waitForAssets(slide: Slide) {
  await document.fonts.ready;
  await Promise.all(slideImageUrls(slide).map(preloadImage));
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
) {
  if (slides.length === 0) {
    throw new Error("Keine Slides zum Exportieren.");
  }

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;";
  document.body.appendChild(host);

  let root: Root | null = createRoot(host);
  const zip = new JSZip();

  try {
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]!;
      flushSync(() => {
        root!.render(
          createElement(CarouselSlidePreview, {
            slide,
            scale: 1,
            forExport: true,
          }),
        );
      });

      const node = host.querySelector(
        "[data-carousel-canvas]",
      ) as HTMLElement | null;
      if (!node) {
        throw new Error(`Slide ${i + 1} konnte nicht gerendert werden.`);
      }

      await waitForAssets(slide);

      const dataUrl = await toPng(node, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        pixelRatio: 1,
        cacheBust: true,
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
