import sharp from "sharp";
import {
  clampExtract,
  cropToExtract,
  isDefaultEditParams,
  parseEditParams,
  straightenCoverExtract,
  type DamCrop,
  type DamEditParams,
} from "@/lib/dam/edit-params";
import {
  buildDamExportMetadata,
  type DamExportEditorial,
} from "@/lib/dam/export-metadata";
import { decodeHeicIfNeeded } from "@/lib/dam/heic";
import { applyToneToPixels, isNeutralTone } from "@/lib/dam/tone";

type SharpInstance = ReturnType<typeof sharp>;

type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
};

/**
 * Intermediate steps stay as uncompressed 8-bit sRGB pixels. A bare
 * `toBuffer()` would re-encode in the input format (JPEG q80 for JPEG
 * originals) and lose quality at every step.
 */
async function toRaw(pipeline: SharpInstance): Promise<RawImage> {
  const { data, info } = await pipeline
    .toColourspace("srgb")
    .raw({ depth: "uchar" })
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function fromRaw(image: RawImage): SharpInstance {
  return sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: image.channels },
  });
}

/**
 * Edits on an already EXIF-oriented image, returned as raw sRGB pixels.
 * Geometry (rotate / flip / straighten-cover / crop) runs before tone ops.
 * Sharpening is not applied here — it belongs to the output size
 * (see `applyOutputSharpen`).
 */
async function renderEditedRaw(
  oriented: SharpInstance,
  params: DamEditParams,
): Promise<RawImage> {
  const src = await oriented.clone().metadata();
  const srcWidth = src.width ?? 0;
  const srcHeight = src.height ?? 0;

  let pipeline = oriented;
  const angle = ((params.rotate % 360) + 360) % 360;
  if (angle !== 0) {
    pipeline = pipeline.rotate(angle, {
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    });
  }
  if (params.flipVertical) pipeline = pipeline.flip();
  if (params.flipHorizontal) pipeline = pipeline.flop();

  let image = await toRaw(pipeline);

  const cover = srcWidth && srcHeight
    ? straightenCoverExtract(srcWidth, srcHeight, params.rotate)
    : null;
  if (cover) {
    image = await toRaw(
      fromRaw(image).extract(clampExtract(cover, image.width, image.height)),
    );
  }
  if (params.crop) {
    image = await toRaw(
      fromRaw(image).extract(cropToExtract(params.crop, image.width, image.height)),
    );
  }

  if (!isNeutralTone(params)) {
    applyToneToPixels(image.data, image.channels, params);
  }
  return image;
}

async function orientedPipeline(input: Buffer): Promise<SharpInstance> {
  const decoded = await decodeHeicIfNeeded(input);
  return sharp(decoded, { failOn: "none" }).rotate();
}

/**
 * Output sharpening (unsharp mask) at the final pixel size. The slider sets
 * the amount; the radius stays small so it adds crispness, not halos.
 */
export function applyOutputSharpen(
  pipeline: SharpInstance,
  sharpen: number,
  longEdge: number,
): SharpInstance {
  if (sharpen <= 0) return pipeline;
  const amount = (sharpen / 100) * 2.5;
  const sigma = longEdge > 3000 ? 1.0 : longEdge > 1200 ? 0.8 : 0.6;
  return pipeline.sharpen({ sigma, m1: amount * 0.4, m2: amount * 1.5 });
}

/**
 * Apply non-destructive editParams onto an original and return a lossless
 * PNG (archive master stays unedited). Used by tests and callers that need an
 * encoded buffer; render paths below keep raw pixels until the final encode.
 */
export async function applyDamEdits(
  input: Buffer,
  raw: unknown,
): Promise<Buffer> {
  const params = parseEditParams(raw);
  const image = await renderEditedRaw(await orientedPipeline(input), params);
  return encodeLossless(image, params);
}

export async function applyDamEditsToOriented(
  oriented: Buffer,
  params: DamEditParams,
): Promise<Buffer> {
  const image = await renderEditedRaw(sharp(oriented), params);
  return encodeLossless(image, params);
}

function encodeLossless(image: RawImage, params: DamEditParams): Promise<Buffer> {
  const longEdge = Math.max(image.width, image.height);
  return applyOutputSharpen(fromRaw(image), params.sharpen, longEdge)
    .png()
    .toBuffer();
}

export async function renderDamPreviewWebp(
  original: Buffer,
  raw: unknown,
  maxWidth: number,
  quality: number,
): Promise<Buffer> {
  const params = parseEditParams(raw);
  const image = await renderEditedRaw(await orientedPipeline(original), params);
  const width = Math.min(maxWidth, image.width);
  const height = Math.round((image.height * width) / image.width);
  const resized = fromRaw(image).resize({ width, withoutEnlargement: true });
  return applyOutputSharpen(resized, params.sharpen, Math.max(width, height))
    .webp({ quality })
    .withIccProfile("srgb")
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
type SharpMetadata = Awaited<ReturnType<SharpInstance["metadata"]>>;

function encodeFormatFromSource(meta: SharpMetadata): PublishedEncodeFormat {
  if (meta.format === "tiff") return "tiff";
  if (meta.format === "png" || meta.hasAlpha) return "png";
  if (meta.format === "webp") return "webp";
  return "jpeg";
}

/** 4:4:4 keeps colour edges (red text, logos) crisp; mozjpeg packs it smaller. */
const PUBLISHED_JPEG = {
  quality: 90,
  mozjpeg: true,
  chromaSubsampling: "4:4:4",
} as const;

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
    pipeline: pipeline.jpeg(PUBLISHED_JPEG),
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
  const params = parseEditParams(raw);
  const metadata = editorial ? buildDamExportMetadata(editorial) : null;
  let pipeline: SharpInstance;
  if (isDefaultEditParams(params)) {
    // No recipe: encode straight from the source (keeps 16-bit TIFF depth).
    pipeline = sharp(decoded, { failOn: "none" }).rotate();
    // Print TIFF masters may still be CMYK until this export path.
    if (sourceMeta.space === "cmyk") pipeline = pipeline.toColourspace("srgb");
  } else {
    const image = await renderEditedRaw(await orientedPipeline(original), params);
    pipeline = applyOutputSharpen(
      fromRaw(image),
      params.sharpen,
      Math.max(image.width, image.height),
    );
  }

  const format = opts?.preserveFormat
    ? encodeFormatFromSource(sourceMeta)
    : "jpeg";
  const encoded = encodePublishedPipeline(pipeline, format);
  pipeline = encoded.pipeline.withIccProfile("srgb");
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
  const params = parseEditParams(editParams);
  const image = await renderEditedRaw(await orientedPipeline(original), params);
  if (!image.width || !image.height) {
    throw new Error("Bildmasse fehlen.");
  }
  const region = cropToExtract(crop, image.width, image.height);
  const metadata = editorial ? buildDamExportMetadata(editorial) : null;
  const resized = fromRaw(image)
    .extract(region)
    .resize(MAILCHIMP_SQUARE_SIZE, MAILCHIMP_SQUARE_SIZE, { fit: "fill" });
  let pipeline = applyOutputSharpen(resized, params.sharpen, MAILCHIMP_SQUARE_SIZE)
    .jpeg(PUBLISHED_JPEG)
    .withIccProfile("srgb");
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
