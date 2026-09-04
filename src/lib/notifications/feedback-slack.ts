import { prisma } from "@/lib/db";
import { parseZurichDayEnd, parseZurichDayStart } from "@/lib/ads-shared";
import {
  getZurichClock,
  type ZurichClock,
} from "@/lib/notifications/cooking-slack";
import {
  buildFeedbackSlackDigestText,
  previousWeekdayDateKey,
} from "@/lib/notifications/feedback-digest";
import { postToSlack } from "@/lib/notifications/slack";

const SEND_FROM_HOUR = 8;

function shouldSendFeedbackDigest(clock: ZurichClock) {
  return previousWeekdayDateKey(clock) != null && clock.hour >= SEND_FROM_HOUR;
}

export async function runSlackFeedbackDigestForAllOrgs(now: Date = new Date()) {
  const clock = getZurichClock(now);
  const summary = { orgs: 0, sent: 0, skipped: 0, errors: 0 };

  const dateKey = previousWeekdayDateKey(clock);
  if (!dateKey || !shouldSendFeedbackDigest(clock)) {
    return summary;
  }

  const orgs = await prisma.organization.findMany({
    where: { slackFeedbackDigestEnabled: true },
    select: {
      id: true,
      slackFeedbackDigestWebhookUrl: true,
      slackFeedbackDigestLastKey: true,
    },
  });
  summary.orgs = orgs.length;
  if (orgs.length === 0) return summary;

  const start = parseZurichDayStart(dateKey);
  const end = parseZurichDayEnd(dateKey);
  const rows = await prisma.feedbackResponse.findMany({
    where: {
      confirmedAt: { gte: start, lte: end },
    },
    select: {
      newsletter: true,
      issueDate: true,
      rating: true,
      comment: true,
    },
    orderBy: [{ newsletter: "asc" }, { createdAt: "asc" }],
  });

  const text = buildFeedbackSlackDigestText({ dateKey, rows });

  for (const org of orgs) {
    if (org.slackFeedbackDigestLastKey === dateKey) {
      summary.skipped += 1;
      continue;
    }
    const result = await postToSlack(text, org.slackFeedbackDigestWebhookUrl);
    if (result.ok && !result.skipped) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { slackFeedbackDigestLastKey: dateKey },
      });
      summary.sent += 1;
    } else if (!result.ok) {
      summary.errors += 1;
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}
