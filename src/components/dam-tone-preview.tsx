"use client";

import { useEffect, useRef } from "react";
import type { DamEditParams } from "@/lib/dam/edit-params";
import { applyToneToPixels, isNeutralTone } from "@/lib/dam/tone";

/** Longest canvas edge; enough for a sharp preview on retina, cheap to redraw. */
const MAX_PREVIEW_EDGE = 1600;

/**
 * Preview-only unsharp mask (3×3 Gaussian). The export uses sharp's unsharp
 * mask at output size; this approximates it at screen size.
 */
function previewSharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sharpen: number,
): void {
  const amount = (sharpen / 100) * 1.5;
  const src = new Uint8ClampedArray(data);
  const row = width * 4;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c += 1) {
        const j = i + c;
        const blur =
          (src[j - row - 4]! + 2 * src[j - row]! + src[j - row + 4]! +
            2 * src[j - 4]! + 4 * src[j]! + 2 * src[j + 4]! +
            src[j + row - 4]! + 2 * src[j + row]! + src[j + row + 4]!) /
          16;
        data[j] = src[j]! + amount * (src[j]! - blur);
      }
    }
  }
}

/**
 * Canvas overlay that renders tone + sharpen edits with the same maths as the
 * server (tone.ts). Hidden at neutral values so the plain <img> shows through.
 */
export function DamTonePreview({
  image,
  params,
}: {
  image: HTMLImageElement | null;
  params: DamEditParams;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<{ img: HTMLImageElement; data: ImageData } | null>(null);
  const active = !isNeutralTone(params) || params.sharpen > 0;

  const { brightness, contrast, saturation, temperature, blackPoint, whitePoint, sharpen } =
    params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas || !image || !image.naturalWidth) return;
    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      if (sourceRef.current?.img !== image) {
        const scale = Math.min(
          1,
          MAX_PREVIEW_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
        );
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        sourceRef.current = {
          img: image,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        };
      }
      const source = sourceRef.current.data;
      const out = new ImageData(
        new Uint8ClampedArray(source.data),
        source.width,
        source.height,
      );
      applyToneToPixels(out.data, 4, {
        brightness,
        contrast,
        saturation,
        temperature,
        blackPoint,
        whitePoint,
      });
      if (sharpen > 0) previewSharpen(out.data, out.width, out.height, sharpen);
      ctx.putImageData(out, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    active,
    image,
    brightness,
    contrast,
    saturation,
    temperature,
    blackPoint,
    whitePoint,
    sharpen,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ visibility: active ? "visible" : "hidden" }}
    />
  );
}
