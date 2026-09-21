import sharp from "sharp";
import {
  clampExtract,
  cropToExtract,
  parseEditParams,
  sharpTemperatureModulate,
  straightenCoverExtract,
  type DamCrop,
  type DamEditParams,
} from "@/lib/dam/edit-params";
import {
  buildDamExportMetadata,
  type DamExportEditorial,
} from "@/lib/dam/export-metadata";
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

/** Output of a download / WePublish render (edits + optional editorial metadata). */
export type PublishedRenderResult = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/tiff";
  extension: "jpg" | "png" | "webp" | "tiff";
  width: number | null;
  height: number | null;
};

type PublishedEncodeFormat = "jpeg" | "png" | "webp" | "tiff";
type SharpInstance = ReturnType<typeof sharp>;
type SharpMetadata = Awaited<ReturnType<SharpInstance["metadata"]>>;

function encodeFormatFromSource(meta: SharpMetadata): PublishedEncodeFormat {
  if (meta.format === "tiff") return "tiff";
  if (meta.format === "png" || meta.hasAlpha) return "png";
  if (meta.format === "webp") return "webp";
  return "jpeg";
}

function encodePublishedPipeline(
  pipeline: SharpInstance,
  format: PublishedEncodeFormat,
): {
  pipeline: SharpInstance;
  contentType: PublishedRenderResult["contentType"];
  extension: PublishedRenderResult["extension"];
} {
  if (format === "tiff") {
    return {
      pipeline: pipeline.tiff({ quality: 90 }),
      contentType: "image/tiff",
      extension: "tiff",
    };
  }
  if (format === "png") {
    return {
      pipeline: pipeline.png(),
      contentType: "image/png",
      extension: "png",
    };
  }
  if (format === "webp") {
    return {
      pipeline: pipeline.webp({ quality: 88 }),
      contentType: "image/webp",
      extension: "webp",
    };
  }
  return {
    pipeline: pipeline.jpeg({ quality: 88 }),
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

/**
 * Apply edit recipe + optional editorial EXIF/XMP for download / WePublish.
 * Default encodes JPEG. `preserveFormat: true` keeps the master container
 * (TIFF/PNG/WebP/JPEG) so «Original» downloads stay in the stored format.
 */
export async function renderPublishedMaster(
  original: Buffer,
  raw: unknown,
  editorial?: DamExportEditorial | null,
  opts?: { preserveFormat?: boolean },
): Promise<PublishedRenderResult> {
  const decoded = await decodeHeicIfNeeded(original);
  const sourceMeta = await sharp(decoded, { failOn: "none" }).metadata();
  const edited = await applyDamEdits(original, raw);
  const metadata = editorial ? buildDamExportMetadata(editorial) : null;
  let pipeline = sharp(edited, { failOn: "none" });
  const space = (await pipeline.clone().metadata()).space;
  // Print TIFF masters may still be CMYK until this export path.
  if (space === "cmyk") pipeline = pipeline.toColorspace("srgb");

  const format = opts?.preserveFormat
    ? encodeFormatFromSource(sourceMeta)
    : "jpeg";
  const encoded = encodePublishedPipeline(pipeline, format);
  pipeline = encoded.pipeline;
  if (metadata?.exif) pipeline = pipeline.withExif(metadata.exif);
  if (metadata?.xmp) pipeline = pipeline.withXmp(metadata.xmp);
  const buffer = await pipeline.toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    contentType: encoded.contentType,
    extension: encoded.extension,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}

export const MAILCHIMP_SQUARE_SIZE = 800;

/**
 * One-off Mailchimp export: apply saved edits, then a temporary 1:1 crop,
 * then resize to 800×800 JPEG. Does not persist the crop on the asset.
 */
export async function renderMailchimpSquare(
  original: Buffer,
  editParams: unknown,
  crop: DamCrop,
  editorial?: DamExportEditorial | null,
): Promise<PublishedRenderResult> {
  const edited = await applyDamEdits(original, editParams);
  const meta = await sharp(edited, { failOn: "none" }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("Bildmasse fehlen.");
  }
  const region = cropToExtract(crop, width, height);
  const metadata = editorial ? buildDamExportMetadata(editorial) : null;
  let pipeline = sharp(edited, { failOn: "none" })
    .extract(region)
    .resize(MAILCHIMP_SQUARE_SIZE, MAILCHIMP_SQUARE_SIZE, { fit: "fill" })
    .jpeg({ quality: 88 });
  if (metadata?.exif) pipeline = pipeline.withExif(metadata.exif);
  if (metadata?.xmp) pipeline = pipeline.withXmp(metadata.xmp);
  const buffer = await pipeline.toBuffer();
  const out = await sharp(buffer).metadata();
  return {
    buffer,
    contentType: "image/jpeg",
    extension: "jpg",
    width: out.width ?? MAILCHIMP_SQUARE_SIZE,
    height: out.height ?? MAILCHIMP_SQUARE_SIZE,
  };
}
