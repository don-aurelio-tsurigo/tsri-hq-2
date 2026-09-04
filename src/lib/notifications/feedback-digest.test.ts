import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFeedbackSlackDigestText,
  previousWeekdayDateKey,
} from "@/lib/notifications/feedback-digest";

function clock(weekdayShort: string, dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return {
    weekdayShort,
    calendarDate: new Date(Date.UTC(year, month - 1, day, 12)),
  };
}

describe("previousWeekdayDateKey", () => {
  it("uses Friday on Monday and yesterday on other weekdays", () => {
    assert.equal(previousWeekdayDateKey(clock("Mon", "2026-09-07")), "2026-09-04");
    assert.equal(previousWeekdayDateKey(clock("Wed", "2026-09-02")), "2026-09-01");
  });

  it("skips Saturday and Sunday", () => {
    assert.equal(previousWeekdayDateKey(clock("Sat", "2026-09-05")), null);
    assert.equal(previousWeekdayDateKey(clock("Sun", "2026-09-06")), null);
  });
});

describe("buildFeedbackSlackDigestText", () => {
  it("groups counts and comments per newsletter", () => {
    const text = buildFeedbackSlackDigestText({
      dateKey: "2026-09-02",
      rows: [
        {
          newsletter: "zueri-briefing",
          issueDate: "2026-09-02",
          rating: "POSITIVE",
          comment: "Mehr Züri bitte",
        },
        {
          newsletter: "zueri-briefing",
          issueDate: "2026-09-02",
          rating: "NEGATIVE",
          comment: null,
        },
        {
          newsletter: "tsueritipp",
          issueDate: "2026-09-02",
          rating: "NEUTRAL",
          comment: "Geht so",
        },
      ],
    });
    assert.match(text, /Newsletter-Feedback — Mittwoch, 2\. September 2026/);
    assert.match(text, /Züri Briefing/);
    assert.match(text, /Gut 1/);
    assert.match(text, /Nicht so gut 1/);
    assert.match(text, /• Gut: Mehr Züri bitte/);
    assert.match(text, /Tsüritipp/);
    assert.match(text, /Geht so 1/);
    assert.match(text, /Im Feedback-Dashboard öffnen/);
  });

  it("says when nobody voted", () => {
    const text = buildFeedbackSlackDigestText({
      dateKey: "2026-09-04",
      rows: [],
    });
    assert.match(text, /Keine bestätigten Stimmen/);
  });
});
