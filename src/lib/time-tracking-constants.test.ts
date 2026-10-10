import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBreakHours,
  computeWorkedHours,
  todayInZurich,
  toTimeDateKey,
  type TimeSegmentInput,
} from "./time-tracking-constants";

const work = (startTime: string, endTime: string): TimeSegmentInput => ({
  type: "work",
  startTime,
  endTime,
});
const pause = (startTime: string, endTime: string): TimeSegmentInput => ({
  type: "break",
  startTime,
  endTime,
});

describe("computeWorkedHours", () => {
  it("zieht eine Pause innerhalb eines Arbeitsblocks ab", () => {
    const segs = [work("09:00", "17:00"), pause("12:00", "13:00")];
    assert.equal(computeWorkedHours(segs), 7);
    assert.equal(computeBreakHours(segs), 1);
  });

  it("zieht eine Pause in der Lücke zwischen Blöcken nicht doppelt ab", () => {
    const segs = [
      work("09:00", "12:00"),
      pause("12:00", "13:00"),
      work("13:00", "17:00"),
    ];
    assert.equal(computeWorkedHours(segs), 7);
    assert.equal(computeBreakHours(segs), 1);
  });

  it("zählt Lücken ohne erfasste Pause als Pause", () => {
    const segs = [work("08:00", "12:00"), work("12:30", "17:00")];
    assert.equal(computeWorkedHours(segs), 8.5);
    assert.equal(computeBreakHours(segs), 0.5);
  });

  it("zieht nur den überlappenden Teil einer Pause ab", () => {
    const segs = [work("09:00", "12:00"), pause("11:30", "13:00")];
    assert.equal(computeWorkedHours(segs), 2.5);
  });

  it("gibt 0 für nur Pause oder leere Liste", () => {
    assert.equal(computeWorkedHours([]), 0);
    assert.equal(computeWorkedHours([pause("12:00", "13:00")]), 0);
    assert.equal(computeBreakHours([pause("12:00", "13:00")]), 0);
  });
});

describe("todayInZurich", () => {
  it("nimmt das Zürcher Datum, nicht das UTC-Datum", () => {
    // 23:30 UTC am 9.10. = 01:30 in Zürich am 10.10. (Sommerzeit)
    const now = new Date("2026-10-09T23:30:00.000Z");
    assert.equal(toTimeDateKey(todayInZurich(now)), "2026-10-10");
  });
});
