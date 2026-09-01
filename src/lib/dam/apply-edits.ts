import sharp from "sharp";
import {
  clampExtract,
  cropToExtract,
  parseEditParams,
  sharpTemperatureModulate,
  straightenCoverExtract,
  type DamEditParams,
} from "@/lib/dam/edit-params";
import { decodeHeicIfNeeded } from "@/lib/dam/heic";

/**
 * Apply non-destructive editParams onto an original.
 * Geometry (rotate / flip / straighten-cover / crop) runs before colour ops.
 * The archive master stays unedited; this is used for download, WePublish, and tests.
 */
export async function applyDamEdits(
  input: Buffer,
  raw: unknown,
): Promise<Buffer> {
  const params = parseEditParams(raw);
  const decoded = await decodeHeicIfNeeded(input);
  const oriented = await sharp(decoded).rotate().toBuffer();
  return applyDamEditsToOriented(oriented, params);
}

export async function applyDamEditsToOriented(
  oriented: Buffer,
  params: DamEditParams,
): Promise<Buffer> {
  const src = await sharp(oriented).metadata();
  const srcWidth = src.width ?? 0;
  const srcHeight = src.height ?? 0;

  let pipeline = sharp(oriented);
  const angle = ((params.rotate % 360) + 360) % 360;

  if (angle !== 0) {
    pipeline = pipeline.rotate(angle, {
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    });
  }
  if (params.flipVertical) pipeline = pipeline.flip();
  if (params.flipHorizontal) pipeline = pipeline.flop();

  const cover = srcWidth && srcHeight
    ? straightenCoverExtract(srcWidth, srcHeight, params.rotate)
    : null;

  if (cover || params.crop) {
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    let current = data;
    let width = info.width;
    let height = info.height;
    if (cover) {
      const region = clampExtract(cover, width, height);
      const extracted = await sharp(current).extract(region).toBuffer({
        resolveWithObject: true,
      });
      current = extracted.data;
      width = extracted.info.width;
      height = extracted.info.height;
    }
    if (params.crop) {
      const region = cropToExtract(params.crop, width, height);
      current = await sharp(current).extract(region).toBuffer();
    }
    pipeline = sharp(current);
  }

  const brightness = params.brightness / 100;
  const saturation = params.saturation / 100;
  if (brightness !== 1 || saturation !== 1) {
    pipeline = pipeline.modulate({ brightness, saturation });
  }

  const contrast = params.contrast / 100;
  if (contrast !== 1) {
    pipeline = pipeline.linear(contrast, 128 * (1 - contrast));
  }

  if (params.sharpen > 0) {
    pipeline = pipeline.sharpen({
      sigma: Math.max(0.000001, params.sharpen / 20),
    });
  }

  if (params.temperature !== 0) {
    const temperature = sharpTemperatureModulate(params.temperature);
    if (temperature) {
      pipeline = pipeline.modulate({
        hue: temperature.hue,
        saturation: temperature.saturation,
      });
    }
  }

  return pipeline.toBuffer();
}

export async function renderDamPreviewWebp(
  original: Buffer,
  raw: unknown,
  maxWidth: number,
  quality: number,
): Promise<Buffer> {
  const edited = await applyDamEdits(original, raw);
  return sharp(edited)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/** JPEG with the recipe applied — for download / WePublish, not the stored original. */
export async function renderPublishedMaster(
  original: Buffer,
  raw: unknown,
): Promise<{ buffer: Buffer; width: number | null; height: number | null }> {
  const edited = await applyDamEdits(original, raw);
  const buffer = await sharp(edited).jpeg({ quality: 88 }).toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}
