import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleIssueSummaries,
  attachCommentsToIssues,
  buildFeedbackStats,
  consumeFeedbackRateLimit,
  feedbackCommentsToCsv,
  formatIssueDateLabel,
  parseFeedbackClickInput,
  parseFeedbackId,
  resetFeedbackRateLimit,
  sanitizeFeedbackComment,
  satisfactionScore,
} from "@/lib/feedback";

describe("parseFeedbackClickInput", () => {
  it("accepts mailchimp-style query params", () => {
    const parsed = parseFeedbackClickInput({
      newsletter: "zueri-briefing",
      campaign: "abc123UID",
      date: "2026-08-28",
      rating: "positive",
    });
    assert.deepEqual(parsed, {
      newsletter: "zueri-briefing",
      campaignId: "abc123UID",
      issueDate: "2026-08-28",
      rating: "POSITIVE",
      email: null,
      membershipStatus: 0,
    });
  });

  it("accepts email and membership status from the click link", () => {
    const parsed = parseFeedbackClickInput({
      newsletter: "zueri-briefing",
      campaign: "abc123UID",
      date: "2026-08-28",
      rating: "NEUTRAL",
      email: "  Reader@Tsri.ch ",
      membership: "-1",
    });
    assert.deepEqual(parsed, {
      newsletter: "zueri-briefing",
      campaignId: "abc123UID",
      issueDate: "2026-08-28",
      rating: "NEUTRAL",
      email: "reader@tsri.ch",
      membershipStatus: -1,
    });
  });

  it("treats empty membership as not a member", () => {
    const parsed = parseFeedbackClickInput({
      newsletter: "zueri-briefing",
      campaign: "abc123UID",
      date: "2026-08-28",
      rating: "POSITIVE",
      email: "a@b.ch",
      membership: "",
    });
    assert.equal(parsed?.email, "a@b.ch");
    assert.equal(parsed?.membershipStatus, 0);
  });

  it("rejects invalid email or membership", () => {
    const base = {
      newsletter: "zueri-briefing",
      campaign: "abc123UID",
      date: "2026-08-28",
      rating: "POSITIVE",
    };
    assert.equal(
      parseFeedbackClickInput({ ...base, email: "not-an-email", membership: "1" }),
      null,
    );
    assert.equal(
      parseFeedbackClickInput({ ...base, email: "a@b.ch", membership: "2" }),
      null,
    );
  });

  it("rejects missing or malformed values", () => {
    assert.equal(
      parseFeedbackClickInput({
        newsletter: "Züri",
        campaign: "x",
        date: "2026-08-28",
        rating: "POSITIVE",
      }),
      null,
    );
    assert.equal(
      parseFeedbackClickInput({
        newsletter: "zueri-briefing",
        campaign: "x",
        date: "28.08.2026",
        rating: "POSITIVE",
      }),
      null,
    );
    assert.equal(
      parseFeedbackClickInput({
        newsletter: "zueri-briefing",
        campaign: "x",
        date: "2026-08-28",
        rating: "GOOD",
      }),
      null,
    );
  });
});

describe("parseFeedbackId", () => {
  it("accepts uuid v4", () => {
    assert.equal(
      parseFeedbackId("2c1b8e1a-4d3f-4a91-9c0e-1f2a3b4c5d6e"),
      "2c1b8e1a-4d3f-4a91-9c0e-1f2a3b4c5d6e",
    );
  });

  it("rejects other ids", () => {
    assert.equal(parseFeedbackId("not-a-uuid"), null);
    assert.equal(parseFeedbackId(""), null);
  });
});

describe("buildFeedbackStats", () => {
  it("returns counts and rounded percentages", () => {
    const stats = buildFeedbackStats({
      newsletter: "zueri-briefing",
      campaignId: "camp-1",
      issueDate: "2026-08-28",
      rows: [
        { rating: "POSITIVE", _count: { _all: 7 } },
        { rating: "NEUTRAL", _count: { _all: 2 } },
        { rating: "NEGATIVE", _count: { _all: 1 } },
      ],
    });
    assert.equal(stats.total, 10);
    assert.deepEqual(stats.counts, { POSITIVE: 7, NEUTRAL: 2, NEGATIVE: 1 });
    assert.deepEqual(stats.percentages, {
      POSITIVE: 70,
      NEUTRAL: 20,
      NEGATIVE: 10,
    });
    assert.equal(stats.issueDate, "2026-08-28");
  });

  it("returns zeros when nobody has confirmed yet", () => {
    const stats = buildFeedbackStats({
      newsletter: "zueri-briefing",
      campaignId: "camp-1",
      issueDate: "2026-08-28",
      rows: [],
    });
    assert.equal(stats.total, 0);
    assert.deepEqual(stats.percentages, {
      POSITIVE: 0,
      NEUTRAL: 0,
      NEGATIVE: 0,
    });
  });
});

describe("formatIssueDateLabel", () => {
  it("formats as Swiss day.month.", () => {
    assert.equal(formatIssueDateLabel("2026-08-28"), "28.08.");
  });
});

describe("satisfactionScore", () => {
  it("maps weighted -1..1 onto 0..100", () => {
    assert.equal(
      satisfactionScore({ POSITIVE: 10, NEUTRAL: 0, NEGATIVE: 0 }),
      100,
    );
    assert.equal(
      satisfactionScore({ POSITIVE: 0, NEUTRAL: 10, NEGATIVE: 0 }),
      50,
    );
    assert.equal(
      satisfactionScore({ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 10 }),
      0,
    );
    assert.equal(
      satisfactionScore({ POSITIVE: 7, NEUTRAL: 2, NEGATIVE: 1 }),
      80,
    );
    assert.equal(
      satisfactionScore({ POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 }),
      null,
    );
  });
});

describe("assembleIssueSummaries", () => {
  it("groups campaign rows and sorts newest first", () => {
    const issues = assembleIssueSummaries([
      {
        issueDate: "2026-08-27",
        campaignId: "old",
        rating: "POSITIVE",
        _count: { _all: 4 },
      },
      {
        issueDate: "2026-08-28",
        campaignId: "new",
        rating: "POSITIVE",
        _count: { _all: 2 },
      },
      {
        issueDate: "2026-08-28",
        campaignId: "new",
        rating: "NEGATIVE",
        _count: { _all: 2 },
      },
    ]);
    assert.equal(issues.length, 2);
    assert.equal(issues[0]?.campaignId, "new");
    assert.equal(issues[0]?.total, 4);
    assert.equal(issues[0]?.score, 50);
    assert.equal(issues[1]?.campaignId, "old");
    assert.equal(issues[1]?.score, 100);
  });
});

describe("attachCommentsToIssues", () => {
  it("groups comments onto matching issues and leaves others empty", () => {
    const issues = assembleIssueSummaries([
      {
        issueDate: "2026-08-28",
        campaignId: "new",
        rating: "POSITIVE",
        _count: { _all: 2 },
      },
      {
        issueDate: "2026-08-27",
        campaignId: "old",
        rating: "NEGATIVE",
        _count: { _all: 1 },
      },
    ]);
    const attached = attachCommentsToIssues(issues, [
      {
        id: "c-new-2",
        newsletter: "zueri-briefing",
        campaignId: "new",
        issueDate: "2026-08-28",
        rating: "NEGATIVE",
        comment: "Zu lang",
        commentAddedAt: "2026-08-28T11:00:00.000Z",
        email: "neg@example.com",
        membershipStatus: 1,
      },
      {
        id: "c-new-1",
        newsletter: "zueri-briefing",
        campaignId: "new",
        issueDate: "2026-08-28",
        rating: "POSITIVE",
        comment: "Super",
        commentAddedAt: "2026-08-28T10:00:00.000Z",
        email: null,
        membershipStatus: 0,
      },
    ]);
    assert.equal(attached[0]?.campaignId, "new");
    assert.deepEqual(
      attached[0]?.comments.map((row) => row.id),
      ["c-new-2", "c-new-1"],
    );
    assert.equal(attached[1]?.campaignId, "old");
    assert.equal(attached[1]?.comments.length, 0);
  });
});

describe("feedbackCommentsToCsv", () => {
  it("emits semicolon csv with escaped comments", () => {
    const csv = feedbackCommentsToCsv([
      {
        issueDate: "2026-08-28",
        rating: "NEGATIVE",
        comment: 'Bitte "mehr" Zürich; danke',
        email: "reader@tsri.ch",
        membershipStatus: 1,
      },
    ]);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.match(csv, /issueDate;rating;comment;email;membershipStatus/);
    assert.match(csv, /"Bitte ""mehr"" Zürich; danke"/);
    assert.match(csv, /reader@tsri.ch;1/);
  });
});

describe("sanitizeFeedbackComment", () => {
  it("trims and rejects empty comments", () => {
    assert.equal(sanitizeFeedbackComment("  hallo  "), "hallo");
    assert.equal(sanitizeFeedbackComment("   "), null);
    assert.equal(sanitizeFeedbackComment(12), null);
  });
});

describe("consumeFeedbackRateLimit", () => {
  it("allows a burst then blocks", () => {
    resetFeedbackRateLimit();
    for (let i = 0; i < 30; i++) {
      assert.equal(consumeFeedbackRateLimit("1.2.3.4"), true);
    }
    assert.equal(consumeFeedbackRateLimit("1.2.3.4"), false);
    assert.equal(consumeFeedbackRateLimit("9.9.9.9"), true);
  });
});
