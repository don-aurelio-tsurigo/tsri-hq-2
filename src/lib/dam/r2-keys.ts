import { derivativeKey } from "@/lib/dam/filename";

export function r2KeysForAsset(r2Key: string): string[] {
  return [r2Key, derivativeKey(r2Key, "thumb"), derivativeKey(r2Key, "web")];
}

/** Square face thumbnail written by the face scan (see face-scan.ts). */
export function faceCropKey(assetFaceId: string): string {
  return `faces/${assetFaceId}.webp`;
}
