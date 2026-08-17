import { derivativeKey } from "@/lib/dam/filename";

export function r2KeysForAsset(r2Key: string): string[] {
  return [r2Key, derivativeKey(r2Key, "thumb"), derivativeKey(r2Key, "web")];
}
