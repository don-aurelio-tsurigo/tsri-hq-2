import { createRequire } from "node:module";
import { looksLikeHeicBytes } from "./accept";

type HeicConvert = (options: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  format: "JPEG" | "PNG";
  quality?: number;
}) => Promise<ArrayBuffer>;

const require = createRequire(import.meta.url);
const convert = require("heic-convert") as HeicConvert;

export async function jpegBufferFromHeic(input: Buffer): Promise<Buffer> {
  const output = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.88,
  });
  return Buffer.from(output);
}

export async function decodeHeicIfNeeded(input: Buffer): Promise<Buffer> {
  if (!looksLikeHeicBytes(input)) return input;
  return jpegBufferFromHeic(input);
}
