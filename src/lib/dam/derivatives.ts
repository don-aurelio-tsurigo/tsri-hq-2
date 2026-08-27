import { renderDamPreviewWebp } from "@/lib/dam/apply-edits";
import {
  DEFAULT_EDIT_PARAMS,
  editParamsRev,
  parseEditParams,
} from "@/lib/dam/edit-params";
import { derivativeKey } from "@/lib/dam/filename";
import { putObject } from "@/lib/r2";

const DEFAULT_REV = editParamsRev(DEFAULT_EDIT_PARAMS);

export function isDefaultEditParams(raw: unknown): boolean {
  return editParamsRev(parseEditParams(raw)) === DEFAULT_REV;
}

/**
 * Recipe-scoped thumb/web key. Defaults stay on the classic `_thumb.webp` /
 * `_web.webp` path so existing unedited derivatives keep working.
 */
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
  const thumbKey = previewDerivativeKey(r2Key, "thumb", raw);
  const webKey = previewDerivativeKey(r2Key, "web", raw);
  const writes = [
    putObject(thumbKey, thumb, "image/webp"),
    putObject(webKey, web, "image/webp"),
  ];
  // Keep classic keys in sync too so a recipe miss never falls back to a
  // stale unedited thumb from upload/publish.
  if (thumbKey !== derivativeKey(r2Key, "thumb")) {
    writes.push(putObject(derivativeKey(r2Key, "thumb"), thumb, "image/webp"));
    writes.push(putObject(derivativeKey(r2Key, "web"), web, "image/webp"));
  }
  await Promise.all(writes);
}
