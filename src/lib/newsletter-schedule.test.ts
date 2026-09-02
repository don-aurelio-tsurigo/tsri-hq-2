import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickClosestWeekday,
  scheduledOrCampaignDateKeysInMonth,
  shiftDateKeyToWeekday,
} from "@/lib/newsletter-constants";

describe("newsletter schedule helpers", () => {
  it("merges rhythm dates with off-schedule campaign dates", () => {
    const keys = scheduledOrCampaignDateKeysInMonth(
      [4], // Thursday
      2026,
      8, // September
      ["2026-09-02"], // old Wednesday campaign
    );
    assert.ok(keys.includes("2026-09-02"));
    assert.ok(keys.includes("2026-09-03")); // first Thursday in Sep 2026
  });

  it("shifts a date to another weekday in the same week", () => {
    assert.equal(shiftDateKeyToWeekday("2026-09-02", 4), "2026-09-03");
    assert.equal(shiftDateKeyToWeekday("2026-09-09", 4), "2026-09-10");
  });

  it("picks the closest target weekday", () => {
    assert.equal(pickClosestWeekday(3, [2, 4]), 2);
    assert.equal(pickClosestWeekday(3, [5]), 5);
  });
});
