/** Opening marks of a quotation inside a quote slide. */
const OPENERS = new Set(["«", "„"]);
/** Closing marks of a quotation inside a quote slide. */
const CLOSERS = new Set(["»", "”"]);
/** Marks used both to open and close (resolved by position). */
const AMBIGUOUS = new Set(['"', "“"]);

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * House style for quote slides: a quotation *inside* the quote uses single
 * guillemets ‹ ›. The outer « is drawn by the template; only the final
 * closing » of the whole quote stays a double guillemet.
 *
 * Works on stored slide markup (may contain <b>, <i>, <br/>).
 */
export function normalizeQuoteMarks(input: string): string {
  if (!input) return input;
  let text = input
    .replace(/&laquo;|&#171;|&#x0*ab;/gi, "«")
    .replace(/&raquo;|&#187;|&#x0*bb;/gi, "»")
    .replace(/&quot;|&#34;|&#x0*22;/gi, '"');

  // Final » closes the whole quote — unless an inner quotation is still open.
  let suffix = "";
  const tail = text.match(/»((?:\s|<\/[bi]>)*)$/i);
  if (tail && tail.index !== undefined) {
    const before = text.slice(0, tail.index);
    // A « at the very start pairs with this final » (whole quote in «…»).
    const inner = before.replace(/^((?:\s|<[bi]>)*)«/i, "$1");
    const innerOpen =
      countMatches(inner, /[«„]/g) > countMatches(inner, /[»”]/g);
    if (!innerOpen) {
      suffix = `»${tail[1]}`;
      text = before;
    }
  }

  // A leading « without partner is the outer mark (already in the template).
  let prefix = "";
  const head = text.match(/^((?:\s|<[bi]>)*)«/i);
  if (head) {
    const rest = text.slice(head[0].length);
    const hasPartner =
      countMatches(rest, /[»”]/g) > countMatches(rest, /[«„]/g);
    if (!hasPartner) {
      prefix = head[1] ?? "";
      text = rest;
    }
  }

  let open = false;
  let out = "";
  for (const ch of text) {
    if (OPENERS.has(ch)) {
      out += "‹";
      open = true;
    } else if (CLOSERS.has(ch)) {
      out += "›";
      open = false;
    } else if (AMBIGUOUS.has(ch)) {
      out += open ? "›" : "‹";
      open = !open;
    } else {
      out += ch;
    }
  }
  return prefix + out + suffix;
}
