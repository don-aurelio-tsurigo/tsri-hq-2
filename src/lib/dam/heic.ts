import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { looksLikeHeicBytes } from "./accept";
import { damDebug, damMem } from "./debug-mem";

type HeicDecoded = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
};

type HeicDecodeFn = (options: { buffer: Buffer }) => Promise<HeicDecoded>;

let decodeFn: HeicDecodeFn | undefined;
let heicInFlight = 0;

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
  heicInFlight += 1;
  try {
    const decoded = await loadDecode()({ buffer: input });
    if (!decoded.width || !decoded.height) {
      throw new Error("HEIC decode produced empty image");
    }
    const raw = Buffer.from(decoded.data);
    // #region agent log
    damDebug("B", "heic.ts:decoded", "HEIC decoded to raw RGBA", {
      inFlight: heicInFlight,
      inputMb: Math.round((input.length / 1048576) * 10) / 10,
      rawMb: Math.round((raw.byteLength / 1048576) * 10) / 10,
      width: decoded.width,
      height: decoded.height,
      mem: damMem(),
    });
    // #endregion
    const jpeg = await sharp(raw, {
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
    // #region agent log
    damDebug("E", "heic.ts:jpeg", "HEIC converted to JPEG", {
      inFlight: heicInFlight,
      jpegMb: Math.round((jpeg.length / 1048576) * 10) / 10,
      mem: damMem(),
    });
    // #endregion
    return jpeg;
  } finally {
    heicInFlight -= 1;
  }
}

export async function decodeHeicIfNeeded(input: Buffer): Promise<Buffer> {
  if (!looksLikeHeicBytes(input)) return input;
  return jpegBufferFromHeic(input);
}
