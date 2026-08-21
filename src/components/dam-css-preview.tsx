"use client";

import {
  cssPreviewStyle,
  frameAfterQuarter,
  type DamEditParams,
} from "@/lib/dam/edit-params";

export function DamCssPreviewImage({
  src,
  alt,
  params,
  width,
  height,
  className,
}: {
  src: string;
  alt: string;
  params: DamEditParams;
  width: number | null;
  height: number | null;
  className?: string;
}) {
  const srcW = width && width > 0 ? width : 3;
  const srcH = height && height > 0 ? height : 2;
  const frame = frameAfterQuarter(srcW, srcH, params.rotate);

  return (
    <div
      className={[
        "flex h-full w-full min-h-0 min-w-0 items-center justify-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative min-h-0 min-w-0 max-h-full max-w-full">
        <svg
          viewBox={`0 0 ${frame.width} ${frame.height}`}
          width={frame.width}
          height={frame.height}
          className="block h-auto max-h-full w-auto max-w-full"
          aria-hidden
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: "inset(0)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            style={cssPreviewStyle(params, { width: srcW, height: srcH })}
          />
        </div>
      </div>
    </div>
  );
}
