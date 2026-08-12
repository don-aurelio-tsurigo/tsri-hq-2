/** Infer Zahlungskanal from externe Referenz patterns in Payrexx exports. */

export function isCuidLike(value: string): boolean {
  const v = (value || "").trim();
  if (v.length < 20) return false;
  const prefix = v.slice(0, 2).toLowerCase();
  return (prefix === "cm" || prefix === "cl") && /^[a-zA-Z0-9]+$/.test(v);
}

export function isShopifyExtRef(value: string): boolean {
  const v = (value || "").trim();
  if (v.length !== 25) return false;
  if (isCuidLike(v)) return false;
  return /^[a-zA-Z0-9]+$/.test(v);
}

export function guessChannelFromReferences(
  ...refs: (string | null | undefined)[]
): string | null {
  for (const ref of refs) {
    if (!ref) continue;
    const s = String(ref).trim();
    if (isShopifyExtRef(s)) return "Shopify";
    if (isCuidLike(s)) return "We.Publish";
  }
  return null;
}
