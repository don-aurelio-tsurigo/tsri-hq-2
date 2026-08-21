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
  const ar = frame.width / frame.height;

  return (
    <div
      className={["flex h-full w-full min-h-0 min-w-0 items-center justify-center [container-type:size]", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="overflow-hidden"
        style={{
          aspectRatio: `${frame.width} / ${frame.height}`,
          width: `min(100cqw, calc(100cqh * ${ar}))`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="block h-full w-full object-cover"
          style={cssPreviewStyle(params, { width: srcW, height: srcH })}
        />
      </div>
    </div>
  );
}
