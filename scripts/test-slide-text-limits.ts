import { createEmptyQuoteSlide, createEmptyTextSlide } from "../src/lib/carousel/slides";
import {
  countParagraphBreaks,
  enforceSlideTextLimits,
  TEXT_LIMIT_NO_BREAK,
  TEXT_LIMIT_TWO_BREAKS,
  textLimitForParagraphBreaks,
  visibleTextLength,
} from "../src/lib/carousel/text-limits";
import type { QuoteSlide, Slide, TextSlide } from "../src/lib/carousel/types";

type TextOrQuote = TextSlide | QuoteSlide;

function isTextOrQuote(slide: Slide): slide is TextOrQuote {
  return slide.type === "text" || slide.type === "quote";
}

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
  if (!isTextOrQuote(before) || !isTextOrQuote(after)) return;
  const rawBefore =
    before.type === "text" ? before.bodyHtml : before.quoteText;
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
    console.log(`attribution before: ${JSON.stringify(before.attribution)}`);
    if (after.type === "quote") {
      console.log(`attribution after:  ${JSON.stringify(after.attribution)}`);
    }
  }
  console.log(`visible before: ${visibleTextLength(rawBefore)}`);
  console.log(`visible after:  ${visibleTextLength(rawAfter)}`);
  const attributionChanged =
    before.type === "quote" &&
    after.type === "quote" &&
    before.attribution !== after.attribution;
  console.log(`changed: ${rawBefore !== rawAfter || attributionChanged}`);
  console.log("--- BEFORE ---");
  console.log(rawBefore);
  console.log("--- AFTER ---");
  console.log(rawAfter);
  console.log(`ends with: ${JSON.stringify(rawAfter.slice(-40))}`);
}

const overNoBreak = overflowByWords(
  "Am Mittwochabend heisst es: Wir starren alle die Sonne an.",
  TEXT_LIMIT_NO_BREAK,
  4,
);

const twoParagraphs = [
  overflowByWords("Erster Absatz mit etwas Inhalt.", 160, 0),
  overflowByWords("Zweiter Absatz folgt direkt.", 90, 0),
  overflowByWords("Dritter Absatz macht das Limit knackig.", 80, 3),
].join("<br/><br/>");

const tagAtCut = `${overflowByWords("Vor dem Highlight kommt ganz viel Fliesstext.", TEXT_LIMIT_NO_BREAK - 10, 0)} <b>erste zweite dritte vierte</b> und noch mehr Text danach der weg muss.`;

const quoteOver300 = overflowByWords(
  "Aber nicht nur in der Innenstadt liegen diese Bäche.",
  300,
  3,
);

const slides: Slide[] = [
  { ...createEmptyTextSlide(), bodyHtml: overNoBreak },
  { ...createEmptyTextSlide(), bodyHtml: twoParagraphs },
  { ...createEmptyTextSlide(), bodyHtml: tagAtCut },
  { ...createEmptyQuoteSlide(), quoteText: quoteOver300 },
];

const enforced = enforceSlideTextLimits(slides);

report(
  `1) Text ohne Absatz knapp über ${TEXT_LIMIT_NO_BREAK}`,
  slides[0]!,
  enforced[0]!,
);
report(
  `2) Text mit zwei Absatzumbrüchen knapp über ${TEXT_LIMIT_TWO_BREAKS}`,
  slides[1]!,
  enforced[1]!,
);
report(
  `3) <b>-Tag genau an der ${TEXT_LIMIT_NO_BREAK}er-Schnittstelle`,
  slides[2]!,
  enforced[2]!,
);
report("4) Quote knapp über 300", slides[3]!, enforced[3]!);

const sentenceInWindow = overflowByWords(
  `${overflowByWords("Einleitung ohne Punkt", 360, 0)} Jetzt kommt der Schlusssatz.`,
  TEXT_LIMIT_NO_BREAK + 20,
  5,
);
const earlySentenceOnly = overflowByWords(
  "Kurzer Satz ganz am Anfang.",
  TEXT_LIMIT_NO_BREAK,
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

const attributionCases: Slide[] = [
  {
    ...createEmptyQuoteSlide(),
    quoteText: "Kurzes Zitat unter dem Limit.",
    attribution: "Matthias von Hartz, Theater Spektakel",
  },
  {
    ...createEmptyQuoteSlide(),
    quoteText: "Kurzes Zitat unter dem Limit.",
    attribution:
      "Matthias von Hartz, Künstlerischer Leiter des Theater Spektakels",
  },
  {
    ...createEmptyQuoteSlide(),
    quoteText: "Kurzes Zitat unter dem Limit.",
    attribution: "Johanna-Maria Elisabeth von und zu Beispielhausen-Oberstrass",
  },
];
const attributionAfter = enforceSlideTextLimits(attributionCases);
report(
  "7) Kurze Attribution mit Komma (bleibt)",
  attributionCases[0]!,
  attributionAfter[0]!,
);
report(
  "8) Lange Attribution mit Komma (nur Name)",
  attributionCases[1]!,
  attributionAfter[1]!,
);
report(
  "9) Name ohne Komma über 43 Zeichen (bleibt)",
  attributionCases[2]!,
  attributionAfter[2]!,
);
