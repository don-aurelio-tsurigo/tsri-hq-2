import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FEEDBACK_RATING_LABELS,
  emptyFeedbackCounts,
  isFeedbackRating,
  newsletterLabel,
  type FeedbackCounts,
  type FeedbackRating,
} from "@/lib/feedback";
import { getPublicAppOrigin } from "@/lib/app-url";

const WEEKDAY_DAYS_BACK: Record<string, number> = {
  Mon: 3,
  Tue: 1,
  Wed: 1,
  Thu: 1,
  Fri: 1,
};

export type FeedbackDigestRow = {
  newsletter: string;
  issueDate: string;
  rating: string;
  comment: string | null;
};

/** Previous weekday in Zurich: Mon → Friday, Tue–Fri → yesterday. Null on Sat/Sun. */
export function previousWeekdayDateKey(clock: {
  weekdayShort: string;
  calendarDate: Date;
}): string | null {
  const back = WEEKDAY_DAYS_BACK[clock.weekdayShort];
  if (back == null) return null;
  const day = new Date(clock.calendarDate);
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

function formatDigestDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  return format(utc, "EEEE, d. MMMM yyyy", { locale: de });
}

function truncateComment(value: string, max = 280) {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function countsLine(counts: FeedbackCounts) {
  return [
    `${FEEDBACK_RATING_LABELS.POSITIVE} ${counts.POSITIVE}`,
    `${FEEDBACK_RATING_LABELS.NEUTRAL} ${counts.NEUTRAL}`,
    `${FEEDBACK_RATING_LABELS.NEGATIVE} ${counts.NEGATIVE}`,
  ].join("  ·  ");
}

export function buildFeedbackSlackDigestText(input: {
  dateKey: string;
  rows: FeedbackDigestRow[];
}): string {
  const byNewsletter = new Map<
    string,
    { counts: FeedbackCounts; comments: { rating: FeedbackRating; comment: string }[] }
  >();

  for (const row of input.rows) {
    if (!isFeedbackRating(row.rating)) continue;
    let bucket = byNewsletter.get(row.newsletter);
    if (!bucket) {
      bucket = { counts: emptyFeedbackCounts(), comments: [] };
      byNewsletter.set(row.newsletter, bucket);
    }
    bucket.counts[row.rating] += 1;
    const comment = row.comment?.trim();
    if (comment) {
      bucket.comments.push({ rating: row.rating, comment: truncateComment(comment) });
    }
  }

  const newsletters = [...byNewsletter.keys()].sort((a, b) =>
    newsletterLabel(a).localeCompare(newsletterLabel(b), "de"),
  );

  const lines = [
    `*Newsletter-Feedback — ${formatDigestDateLabel(input.dateKey)}*`,
    "",
  ];

  if (newsletters.length === 0) {
    lines.push("Keine bestätigten Stimmen.");
  } else {
    for (const slug of newsletters) {
      const bucket = byNewsletter.get(slug)!;
      const total =
        bucket.counts.POSITIVE + bucket.counts.NEUTRAL + bucket.counts.NEGATIVE;
      lines.push(`*${newsletterLabel(slug)}*  (${total} ${total === 1 ? "Stimme" : "Stimmen"})`);
      lines.push(countsLine(bucket.counts));
      if (bucket.comments.length > 0) {
        lines.push("Kommentare:");
        for (const item of bucket.comments) {
          lines.push(
            `• ${FEEDBACK_RATING_LABELS[item.rating]}: ${item.comment}`,
          );
        }
      }
      lines.push("");
    }
  }

  const dashboard = `${getPublicAppOrigin()}/feedback`;
  lines.push(`<${dashboard}|Im Feedback-Dashboard öffnen>`);
  return lines.join("\n").trimEnd();
}
