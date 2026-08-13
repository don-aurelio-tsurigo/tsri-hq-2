import { createEmptyQuoteSlide, createEmptyTextSlide } from "../src/lib/carousel/slides";
import {
  countParagraphBreaks,
  enforceSlideTextLimits,
  textLimitForParagraphBreaks,
  visibleTextLength,
} from "../src/lib/carousel/text-limits";
import type { Slide } from "../src/lib/carousel/types";

function overflowByWords(prefix: string, target: number, extraWords = 3): string {
  let text = prefix.trimEnd();
  let n = 1;
  while (visibleTextLength(`${text} Wort${n}`) <= target) {
    text = `${text} Wort${n}`;
    n += 1;
  }
  for (let i = 0; i < extraWords; i += 1) {
    text = `${text} Wort${n}`;
    n += 1;
  }
  return text;
}

function report(label: string, before: Slide, after: Slide) {
  if (before.type !== "text" && before.type !== "quote") return;
  const field = before.type === "text" ? "bodyHtml" : "quoteText";
  const rawBefore = before.type === "text" ? before.bodyHtml : before.quoteText;
  const rawAfter = after.type === "text" ? after.bodyHtml : after.quoteText;
  const breaks = before.type === "text" ? countParagraphBreaks(rawBefore) : 0;
  const limit =
    before.type === "quote" ? 300 : textLimitForParagraphBreaks(breaks);

  console.log(`\n=== ${label} ===`);
  console.log(`type: ${before.type}`);
  if (before.type === "text") {
    console.log(`paragraph breaks: ${breaks} → limit ${limit}`);
  } else {
    console.log(`quote limit: ${limit}`);
  }
  console.log(`visible before: ${visibleTextLength(rawBefore)}`);
  console.log(`visible after:  ${visibleTextLength(rawAfter)}`);
  console.log(`changed: ${rawBefore !== rawAfter}`);
  console.log("--- BEFORE ---");
  console.log(rawBefore);
  console.log("--- AFTER ---");
  console.log(rawAfter);
  console.log(`ends with: ${JSON.stringify(rawAfter.slice(-40))}`);
}

const over500 = overflowByWords(
  "Am Mittwochabend heisst es: Wir starren alle die Sonne an.",
  500,
  4,
);

const twoParagraphs = [
  overflowByWords("Erster Absatz mit etwas Inhalt.", 160, 0),
  overflowByWords("Zweiter Absatz folgt direkt.", 90, 0),
  overflowByWords("Dritter Absatz macht das Limit knackig.", 80, 3),
].join("<br/><br/>");

const tagAtCut = `${overflowByWords("Vor dem Highlight kommt ganz viel Fliesstext.", 490, 0)} <b>erste zweite dritte vierte</b> und noch mehr Text danach der weg muss.`;

const quoteOver300 = overflowByWords(
  "Aber nicht nur in der Innenstadt liegen diese Bäche.",
  300,
  3,
);

const slides: Slide[] = [
  { ...createEmptyTextSlide(), bodyHtml: over500 },
  { ...createEmptyTextSlide(), bodyHtml: twoParagraphs },
  { ...createEmptyTextSlide(), bodyHtml: tagAtCut },
  { ...createEmptyQuoteSlide(), quoteText: quoteOver300 },
];

const enforced = enforceSlideTextLimits(slides);

report("1) Text ohne Absatz knapp über 500", slides[0]!, enforced[0]!);
report("2) Text mit zwei Absatzumbrüchen knapp über 300", slides[1]!, enforced[1]!);
report("3) <b>-Tag genau an der 500er-Schnittstelle", slides[2]!, enforced[2]!);
report("4) Quote knapp über 300", slides[3]!, enforced[3]!);

const sentenceInWindow = overflowByWords(
  `${overflowByWords("Einleitung ohne Punkt", 360, 0)} Jetzt kommt der Schlusssatz.`,
  520,
  5,
);
const earlySentenceOnly = overflowByWords(
  "Kurzer Satz ganz am Anfang.",
  500,
  4,
);

const extra: Slide[] = [
  { ...createEmptyTextSlide(), bodyHtml: sentenceInWindow },
  { ...createEmptyTextSlide(), bodyHtml: earlySentenceOnly },
];
const extraAfter = enforceSlideTextLimits(extra);
report(
  "5) Satzende im 70–100%-Fenster (soll am Punkt schneiden)",
  extra[0]!,
  extraAfter[0]!,
);
report(
  "6) Satzende vor 70% (Fallback: letztes Wort)",
  extra[1]!,
  extraAfter[1]!,
);
