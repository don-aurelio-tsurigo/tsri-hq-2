import { renderDamPreviewWebp } from "@/lib/dam/apply-edits";
import {
  DEFAULT_EDIT_PARAMS,
  editParamsRev,
  parseEditParams,
} from "@/lib/dam/edit-params";
import { derivativeKey } from "@/lib/dam/filename";
import { putObject } from "@/lib/r2";

const DEFAULT_REV = editParamsRev(DEFAULT_EDIT_PARAMS);

/** Thumb/web key for the current recipe (defaults stay on the classic key). */
export function previewDerivativeKey(
  r2Key: string,
  kind: "thumb" | "web",
  raw: unknown,
): string {
  const base = derivativeKey(r2Key, kind);
  const rev = editParamsRev(parseEditParams(raw));
  if (rev === DEFAULT_REV) return base;
  return base.replace(/_(thumb|web)\.webp$/, `_$1_${rev}.webp`);
}

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
    putObject(previewDerivativeKey(r2Key, "thumb", raw), thumb, "image/webp"),
    putObject(previewDerivativeKey(r2Key, "web", raw), web, "image/webp"),
  ]);
}
