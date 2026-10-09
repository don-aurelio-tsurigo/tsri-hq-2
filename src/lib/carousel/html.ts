/** HTML4 Latin-1 + common typographic named entities. Numeric &#…; covers the rest. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  iexcl: "¡",
  cent: "¢",
  pound: "£",
  curren: "¤",
  yen: "¥",
  brvbar: "¦",
  sect: "§",
  uml: "¨",
  copy: "©",
  ordf: "ª",
  laquo: "«",
  not: "¬",
  shy: "\u00AD",
  reg: "®",
  macr: "¯",
  deg: "°",
  plusmn: "±",
  sup2: "²",
  sup3: "³",
  acute: "´",
  micro: "µ",
  para: "¶",
  middot: "·",
  cedil: "¸",
  sup1: "¹",
  ordm: "º",
  raquo: "»",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iquest: "¿",
  Agrave: "À",
  Aacute: "Á",
  Acirc: "Â",
  Atilde: "Ã",
  Auml: "Ä",
  Aring: "Å",
  AElig: "Æ",
  Ccedil: "Ç",
  Egrave: "È",
  Eacute: "É",
  Ecirc: "Ê",
  Euml: "Ë",
  Igrave: "Ì",
  Iacute: "Í",
  Icirc: "Î",
  Iuml: "Ï",
  ETH: "Ð",
  Ntilde: "Ñ",
  Ograve: "Ò",
  Oacute: "Ó",
  Ocirc: "Ô",
  Otilde: "Õ",
  Ouml: "Ö",
  times: "×",
  Oslash: "Ø",
  Ugrave: "Ù",
  Uacute: "Ú",
  Ucirc: "Û",
  Uuml: "Ü",
  Yacute: "Ý",
  THORN: "Þ",
  szlig: "ß",
  agrave: "à",
  aacute: "á",
  acirc: "â",
  atilde: "ã",
  auml: "ä",
  aring: "å",
  aelig: "æ",
  ccedil: "ç",
  egrave: "è",
  eacute: "é",
  ecirc: "ê",
  euml: "ë",
  igrave: "ì",
  iacute: "í",
  icirc: "î",
  iuml: "ï",
  eth: "ð",
  ntilde: "ñ",
  ograve: "ò",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  ouml: "ö",
  divide: "÷",
  oslash: "ø",
  ugrave: "ù",
  uacute: "ú",
  ucirc: "û",
  uuml: "ü",
  yacute: "ý",
  thorn: "þ",
  yuml: "ÿ",
  OElig: "Œ",
  oelig: "œ",
  Scaron: "Š",
  scaron: "š",
  Yuml: "Ÿ",
  fnof: "ƒ",
  circ: "ˆ",
  tilde: "˜",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  zwnj: "\u200C",
  zwj: "\u200D",
  lrm: "\u200E",
  rlm: "\u200F",
  ndash: "–",
  mdash: "—",
  hyphen: "‐",
  minus: "−",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  dagger: "†",
  Dagger: "‡",
  permil: "‰",
  lsaquo: "‹",
  rsaquo: "›",
  euro: "€",
  hellip: "…",
  bull: "•",
  trade: "™",
  larr: "←",
  uarr: "↑",
  rarr: "→",
  darr: "↓",
  harr: "↔",
};

const CASE_INSENSITIVE = new Set(["amp", "lt", "gt", "quot", "apos", "nbsp"]);

function namedEntity(name: string): string | undefined {
  if (Object.hasOwn(NAMED_ENTITIES, name)) return NAMED_ENTITIES[name];
  const lower = name.toLowerCase();
  if (CASE_INSENSITIVE.has(lower)) return NAMED_ENTITIES[lower];
  return undefined;
}

function fromCodePoint(code: number): string | null {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

export function decodeHtmlEntities(input: string): string {
  let out = input;
  for (let i = 0; i < 5; i += 1) {
    const next = out
      .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (full, name: string) => {
        return namedEntity(name) ?? full;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (full, hex: string) => {
        return fromCodePoint(Number.parseInt(hex, 16)) ?? full;
      })
      .replace(/&#(\d+);/g, (full, dec: string) => {
        return fromCodePoint(Number(dec)) ?? full;
      });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Decode entities, then keep only <b>, <i>, <br/> as real tags. */
export function sanitizeSlideHtml(input: string): string {
  const escaped = decodeHtmlEntities(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;b&gt;/gi, "<b>")
    .replace(/&lt;\/b&gt;/gi, "</b>")
    .replace(/&lt;i&gt;/gi, "<i>")
    .replace(/&lt;\/i&gt;/gi, "</i>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
    .replace(/\n/g, "<br/>")
    .trim();
}

/** Blank line between Tsüritipp events when the model only emitted a single <br/>. */
export function separateTsueritippEvents(html: string): string {
  return html.replace(
    /<\/i>(?:\s*<br\s*\/?>)*\s*(<b>)/gi,
    "</i><br/><br/>$1",
  );
}

/**
 * Serialize an on-canvas contentEditable element back into slide markup:
 * only <b>, <i> and line breaks (as "\n") survive, like the sidebar textarea.
 */
export function slideHtmlFromEditable(root: Node): string {
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += (child.textContent ?? "").replace(/ /g, " ");
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        out += "\n";
        return;
      }
      const inner = walk(el);
      const weight = el.style?.fontWeight;
      const bold =
        tag === "b" ||
        tag === "strong" ||
        weight === "bold" ||
        Number(weight) >= 600;
      const italic = tag === "i" || tag === "em" || el.style?.fontStyle === "italic";
      if (tag === "div" || tag === "p") {
        if (out && !out.endsWith("\n")) out += "\n";
      }
      if (!inner) return;
      let wrapped = inner;
      if (italic) wrapped = `<i>${wrapped}</i>`;
      if (bold) wrapped = `<b>${wrapped}</b>`;
      out += wrapped;
    });
    return out;
  };
  return walk(root).replace(/\n$/, "");
}
