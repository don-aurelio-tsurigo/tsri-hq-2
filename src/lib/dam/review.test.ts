import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isDamArchiveReviewReminderDay,
  parseReviewFilters,
  parseReviewOpenedAt,
  parseReviewView,
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

  it("adds a star rating clause when filtering", () => {
    const reviewedUntil = new Date("2026-07-01T00:00:00.000Z");
    const openedAt = new Date("2026-08-01T00:00:00.000Z");
    assert.deepEqual(
      reviewQueueWhere(reviewedUntil, openedAt, {
        rating: "eq3",
        collectionId: "",
      }),
      {
        status: "published",
        publishedAt: { gt: reviewedUntil, lte: openedAt },
        AND: [{ rating: 3 }],
      },
    );
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

describe("parseReviewView", () => {
  it("defaults to collections and only switches for photos", () => {
    assert.equal(parseReviewView({}), "collections");
    assert.equal(parseReviewView({ view: "collections" }), "collections");
    assert.equal(parseReviewView({ view: "photos" }), "photos");
    assert.equal(parseReviewView({ view: "weird" }), "collections");
  });
});

describe("parseReviewFilters", () => {
  it("reads rating and collection from the query", () => {
    assert.deepEqual(parseReviewFilters({ rating: "0", collection: "col_1" }), {
      rating: "eq0",
      collectionId: "col_1",
    });
    assert.deepEqual(parseReviewFilters({}), {
      rating: "all",
      collectionId: "",
    });
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
  it("defaults to collections and keeps openedAt", () => {
    const openedAt = new Date("2026-08-01T12:00:00.000Z");
    assert.equal(
      reviewHref(openedAt),
      "/dam/review?opened=2026-08-01T12%3A00%3A00.000Z&view=collections",
    );
    assert.equal(
      reviewHref(openedAt, 3),
      "/dam/review?opened=2026-08-01T12%3A00%3A00.000Z&view=collections&page=3",
    );
    assert.equal(
      reviewHref(openedAt, { view: "photos", rating: "eq2", page: 2 }),
      "/dam/review?opened=2026-08-01T12%3A00%3A00.000Z&view=photos&rating=2&page=2",
    );
  });
});
