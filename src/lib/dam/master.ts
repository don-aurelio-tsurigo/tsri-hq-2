import sharp from "sharp";
import { decodeHeicIfNeeded } from "./heic";

export const MASTER_MAX_EDGE = 4000;

export type MasterImage = {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

function outputFormat(format: string | undefined): "jpeg" | "png" | "webp" {
  if (format === "png") return "png";
  if (format === "webp") return "webp";
  return "jpeg";
}

/**
 * Downscale oversized uploads to a 4000px master. Smaller images stay as-is
 * (no upscaling). HEIC/HEIF becomes JPEG. Aspect ratio is preserved.
 */
export async function createMasterImage(original: Buffer): Promise<MasterImage> {
  const decoded = await decodeHeicIfNeeded(original);
  const image = sharp(decoded, { failOn: "none" }).rotate();
  const meta = await image.clone().metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Bild konnte nicht gelesen werden.");
  }
  const format = outputFormat(meta.format);
  const pipeline = image.resize({
    width: MASTER_MAX_EDGE,
    height: MASTER_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buffer: Buffer;
  let contentType: MasterImage["contentType"];
  let extension: MasterImage["extension"];
  if (format === "png") {
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
