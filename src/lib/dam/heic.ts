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
  const raw = Buffer.from(decoded.data);
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
