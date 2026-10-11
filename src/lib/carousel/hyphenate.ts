import { hyphenateSync } from "hyphen/de-ch-1901";

const SOFT_HYPHEN = "\u00AD";

/** A run of letters (soft hyphens already inside are kept). */
const WORD = /[\p{L}\p{M}\u00AD]+/gu;

/**
 * Same limits as Chrome's default hyphenation (word ≥ 5 letters, ≥ 2 letters
 * on each side), so slides keep wrapping like the posts exported so far.
 */
const MIN_WORD_LENGTH = 5;
const MIN_LEFT = 2;
const MIN_RIGHT = 2;

/**
 * Line-break points for slide text, decided by us instead of the browser.
 *
 * Browsers hyphenate German differently (Safari vs. Chrome vs. Firefox, Mac
 * vs. Windows) — the same slide wrapped differently depending on who opened
 * or exported it, and sometimes overflowed. Slide text therefore uses
 * `hyphens: manual` and gets soft hyphens (Swiss German rules) here, so the
 * editor, every browser and the PNG export break lines identically.
 */
export function hyphenateText(text: string): string {
  return text.replace(WORD, (word) => {
    const plain = word.replace(/\u00AD/g, "");
    if (plain.length < MIN_WORD_LENGTH) return word;
    const parts = hyphenateSync(plain, { hyphenChar: SOFT_HYPHEN }).split(
      SOFT_HYPHEN,
    );
    let out = "";
    let seen = 0;
    parts.forEach((part, index) => {
      if (
        index > 0 &&
        seen >= MIN_LEFT &&
        plain.length - seen >= MIN_RIGHT
      ) {
        out += SOFT_HYPHEN;
      }
      out += part;
      seen += part.length;
    });
    return out;
  });
}

/** Same for slide markup: only text outside of tags is touched. */
export function hyphenateHtml(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((segment) =>
      segment.startsWith("<") ? segment : hyphenateText(segment),
    )
    .join("");
}
