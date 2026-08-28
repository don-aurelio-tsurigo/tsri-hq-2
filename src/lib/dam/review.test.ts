import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDamArchiveReviewReminderDay,
  parseReviewOpenedAt,
  reviewHref,
  reviewQueueWhere,
} from "./review-params.ts";

describe("reviewQueueWhere", () => {
  it("selects published assets between the last cutoff and openedAt", () => {
    const reviewedUntil = new Date("2026-07-01T00:00:00.000Z");
    const openedAt = new Date("2026-08-01T00:00:00.000Z");
    assert.deepEqual(reviewQueueWhere(reviewedUntil, openedAt), {
      status: "published",
      publishedAt: { gt: reviewedUntil, lte: openedAt },
    });
  });
});

describe("parseReviewOpenedAt", () => {
  it("accepts ISO timestamps and rejects junk or future dates", () => {
    const opened = parseReviewOpenedAt("2026-08-01T12:00:00.000Z");
    assert.equal(opened?.toISOString(), "2026-08-01T12:00:00.000Z");
    assert.equal(parseReviewOpenedAt(""), null);
    assert.equal(parseReviewOpenedAt("nope"), null);
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    assert.equal(parseReviewOpenedAt(future), null);
  });
});

describe("isDamArchiveReviewReminderDay", () => {
  it("is true on the 31st when the month has 31 days", () => {
    assert.equal(
      isDamArchiveReviewReminderDay(new Date("2026-08-31T10:00:00.000Z")),
      true,
    );
  });

  it("uses the last calendar day in shorter months", () => {
    assert.equal(
      isDamArchiveReviewReminderDay(new Date("2026-04-30T10:00:00.000Z")),
      true,
    );
    assert.equal(
      isDamArchiveReviewReminderDay(new Date("2026-04-29T10:00:00.000Z")),
      false,
    );
  });

  it("is false on other days", () => {
    assert.equal(
      isDamArchiveReviewReminderDay(new Date("2026-08-15T10:00:00.000Z")),
      false,
    );
  });
});

describe("reviewHref", () => {
  it("keeps openedAt and only adds page when needed", () => {
    const openedAt = new Date("2026-08-01T12:00:00.000Z");
    assert.equal(
      reviewHref(openedAt),
      "/dam/review?opened=2026-08-01T12%3A00%3A00.000Z",
    );
    assert.equal(
      reviewHref(openedAt, 3),
      "/dam/review?opened=2026-08-01T12%3A00%3A00.000Z&page=3",
    );
  });
});
