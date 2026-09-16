import sharp from "sharp";
import { decodeHeicIfNeeded } from "./heic";

export const MASTER_MAX_EDGE = 4000;

export type MasterImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/tiff";
  extension: "jpg" | "png" | "webp" | "tiff";
  width: number;
  height: number;
};

type MasterFormat = "jpeg" | "png" | "webp" | "tiff";
type SharpMetadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

function chooseMasterFormat(meta: SharpMetadata): MasterFormat {
  if (meta.format === "tiff") return "tiff";
  // Keep PNG (esp. with alpha) so transparency is not flattened to JPEG.
  if (meta.format === "png" || meta.hasAlpha) return "png";
  if (meta.format === "webp") return "webp";
  // JPEG / HEIC (decoded) and other photo formats → JPEG master.
  return "jpeg";
}

/**
 * Downscale oversized uploads to a 4000px master. Smaller images stay as-is
 * (no upscaling). HEIC/HEIF becomes JPEG; TIFF and PNG (incl. alpha) keep
 * their container. Aspect ratio is preserved.
 */
export async function createMasterImage(original: Buffer): Promise<MasterImage> {
  const decoded = await decodeHeicIfNeeded(original);
  const image = sharp(decoded, { failOn: "none" }).rotate();
  const meta = await image.clone().metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Bild konnte nicht gelesen werden.");
  }
  // Print TIFFs often ship CMYK; convert before writing master/derivatives
  // so browser previews and thumbs keep correct colours.
  const colorCorrected =
    meta.space === "cmyk" ? image.toColorspace("srgb") : image;
  const format = chooseMasterFormat(meta);
  const pipeline = colorCorrected.resize({
    width: MASTER_MAX_EDGE,
    height: MASTER_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buffer: Buffer;
  let contentType: MasterImage["contentType"];
  let extension: MasterImage["extension"];
  if (format === "tiff") {
    buffer = await pipeline.tiff({ quality: 90 }).toBuffer();
    contentType = "image/tiff";
    extension = "tiff";
  } else if (format === "png") {
    buffer = await pipeline.png().toBuffer();
    contentType = "image/png";
    extension = "png";
  } else if (format === "webp") {
    buffer = await pipeline.webp({ quality: 88 }).toBuffer();
    contentType = "image/webp";
    extension = "webp";
  } else {
    buffer = await pipeline.jpeg({ quality: 88 }).toBuffer();
    contentType = "image/jpeg";
    extension = "jpg";
  }

  const out = await sharp(buffer).metadata();
  return {
    buffer,
    contentType,
    extension,
    width: out.width ?? meta.width ?? 0,
    height: out.height ?? meta.height ?? 0,
  };
}
