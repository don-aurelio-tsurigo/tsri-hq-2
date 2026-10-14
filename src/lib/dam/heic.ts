import { open, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { looksLikeHeicBytes } from "./accept";

type HeicDecoded = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

type HeicDecodeFn = (options: { buffer: Buffer }) => Promise<HeicDecoded>;

let decodeFn: HeicDecodeFn | undefined;

function loadDecode(): HeicDecodeFn {
  if (decodeFn) return decodeFn;
  // Resolve from the app root so Next's bundled chunks still find node_modules.
  const require = createRequire(path.join(process.cwd(), "package.json"));
  decodeFn = require("heic-decode") as HeicDecodeFn;
  return decodeFn;
}

export async function jpegBufferFromHeic(
  input: Buffer,
  maxEdge = 4000,
): Promise<Buffer> {
  const decoded = await loadDecode()({ buffer: input });
  if (!decoded.width || !decoded.height) {
    throw new Error("HEIC decode produced empty image");
  }
  // View on the decoded pixels; Buffer.from(array) would copy ~200 MB per 48 MP photo.
  const { data } = decoded;
  const raw = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return sharp(raw, {
    raw: {
      width: decoded.width,
      height: decoded.height,
      channels: 4,
    },
  })
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export async function decodeHeicIfNeeded(input: Buffer): Promise<Buffer> {
  if (!looksLikeHeicBytes(input)) return input;
  return jpegBufferFromHeic(input);
}

/** Image bytes in memory, or a path to them on disk (large originals). */
export type ImageSource = Buffer | string;

/** First bytes of a source, enough for format sniffing. */
export async function readImageHead(input: ImageSource, length = 64): Promise<Buffer> {
  if (typeof input !== "string") return input.subarray(0, length);
  const handle = await open(input, "r");
  try {
    const head = Buffer.alloc(length);
    const { bytesRead } = await handle.read(head, 0, length, 0);
    return head.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Like decodeHeicIfNeeded, but leaves non-HEIC files on disk for sharp. */
export async function decodeHeicSource(input: ImageSource): Promise<ImageSource> {
  if (typeof input !== "string") return decodeHeicIfNeeded(input);
  if (!looksLikeHeicBytes(await readImageHead(input))) return input;
  return jpegBufferFromHeic(await readFile(input));
}
