import { derivativeKey } from "@/lib/dam/filename";

export function r2KeysForAsset(r2Key: string, sourceR2Key?: string | null): string[] {
  const keys = [r2Key, derivativeKey(r2Key, "thumb"), derivativeKey(r2Key, "web")];
  return sourceR2Key ? [...keys, sourceR2Key] : keys;
}

/** Square face thumbnail written by the face scan (see face-scan.ts). */
export function faceCropKey(assetFaceId: string): string {
  return `faces/${assetFaceId}.webp`;
}
