import { renderDamPreviewWebp } from "@/lib/dam/apply-edits";
import { derivativeKey } from "@/lib/dam/filename";
import { putObject } from "@/lib/r2";

export async function writeEditedDerivatives(
  r2Key: string,
  original: Buffer,
  raw: unknown,
): Promise<void> {
  const [thumb, web] = await Promise.all([
    renderDamPreviewWebp(original, raw, 480, 72),
    renderDamPreviewWebp(original, raw, 2000, 80),
  ]);
  await Promise.all([
    putObject(derivativeKey(r2Key, "thumb"), thumb, "image/webp"),
    putObject(derivativeKey(r2Key, "web"), web, "image/webp"),
  ]);
}
