import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateProposal,
  isRestrictedProfile,
  isTypeEligible,
  type SolverInput,
} from "@/lib/shift-plan-solver";

const briefing = {
  id: "briefing",
  name: "Züri Briefing",
  isEveningShift: true,
  schedulingMode: "newsletter" as const,
  slotDateKeys: ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"],
};
const repo = {
  id: "repo",
  name: "Repo",
  isEveningShift: false,
  schedulingMode: "newsletter" as const,
  slotDateKeys: [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
  ],
};
const council = {
  id: "council",
  name: "Gemeinderats-Briefing",
  isEveningShift: true,
  schedulingMode: "manualDates" as const,
  slotDateKeys: ["2026-09-10", "2026-09-24"],
};

const members = [
  { userId: "alice", name: "Alice", fixedDayOff: null as number | null },
  { userId: "bob", name: "Bob", fixedDayOff: 3 as number | null }, // Wed
  { userId: "cara", name: "Cara", fixedDayOff: null as number | null },
];

function baseInput(over: Partial<SolverInput> = {}): SolverInput {
  return {
    year: 2026,
    month: 9,
    types: [briefing, repo, council],
    members,
    quotas: [],
    vacations: [],
    existing: [],
    briefingTypeId: "briefing",
    councilTypeId: "council",
    ...over,
  };
}

describe("generateProposal", () => {
  it("never assigns two shifts to the same person on one day", () => {
    const result = generateProposal(baseInput());
    const byUserDay = new Map<string, number>();
    for (const a of result.assignments) {
      const k = `${a.userId}:${a.dateKey}`;
      byUserDay.set(k, (byUserDay.get(k) ?? 0) + 1);
    }
    for (const [, n] of byUserDay) {
      assert.equal(n, 1);
    }
  });

  it("respects fixedDayOff", () => {
    const result = generateProposal(baseInput());
    // 2026-09-02 and 2026-09-09 are Wednesdays
    for (const a of result.assignments) {
      if (a.userId === "bob") {
        assert.notEqual(a.dateKey, "2026-09-02");
        assert.notEqual(a.dateKey, "2026-09-09");
      }
    }
  });

  it("respects vacations", () => {
    const result = generateProposal(
      baseInput({
        vacations: [
          { userId: "alice", startKey: "2026-09-01", endKey: "2026-09-05" },
        ],
      }),
    );
    for (const a of result.assignments) {
      if (a.userId === "alice") {
        assert.ok(a.dateKey > "2026-09-05");
      }
    }
  });

  it("fulfills fixed quotas when possible", () => {
    const result = generateProposal(
      baseInput({
        quotas: [
          {
            userId: "alice",
            typeId: "briefing",
            minCount: 2,
            maxCount: 2,
            isFixed: true,
          },
        ],
        types: [briefing, repo],
        councilTypeId: null,
      }),
    );
    const n = result.assignments.filter(
      (a) => a.userId === "alice" && a.typeId === "briefing",
    ).length;
    assert.equal(n, 2);
  });

  it("only assigns council on stub dates", () => {
    const result = generateProposal(
      baseInput({
        quotas: [
          {
            userId: "cara",
            typeId: "council",
            minCount: 2,
            maxCount: 2,
            isFixed: true,
          },
        ],
      }),
    );
    const councilAssign = result.assignments.filter(
      (a) => a.typeId === "council",
    );
    for (const a of councilAssign) {
      assert.ok(["2026-09-10", "2026-09-24"].includes(a.dateKey));
    }
  });

  it("compensates skipped council with extra briefings", () => {
    // Only one open council slot but fixed demand 2 → 1 compensation briefing
    const result = generateProposal(
      baseInput({
        types: [
          briefing,
          repo,
          { ...council, slotDateKeys: ["2026-09-10"] },
        ],
        quotas: [
          {
            userId: "cara",
            typeId: "council",
            minCount: 2,
            maxCount: 2,
            isFixed: true,
          },
        ],
        existing: [
          {
            userId: null,
            typeId: "council",
            dateKey: "2026-09-24",
            status: "skipped",
          },
        ],
      }),
    );
    assert.ok(
      result.warnings.some((w) => w.includes("zusätzliches Züri-Briefing")),
    );
    const briefings = result.assignments.filter(
      (a) => a.userId === "cara" && a.typeId === "briefing",
    );
    assert.ok(briefings.length >= 1);
  });

  it("ensures at least one evening shift when possible", () => {
    const result = generateProposal(
      baseInput({
        types: [briefing, repo],
        councilTypeId: null,
        members: [{ userId: "solo", name: "Solo", fixedDayOff: null }],
      }),
    );
    const evenings = result.assignments.filter(
      (a) => a.userId === "solo" && a.typeId === "briefing",
    );
    assert.ok(evenings.length >= 1);
  });

  it("keeps existing assignments and does not re-emit them", () => {
    const result = generateProposal(
      baseInput({
        existing: [
          {
            userId: "alice",
            typeId: "briefing",
            dateKey: "2026-09-01",
            status: "planned",
          },
        ],
      }),
    );
    assert.ok(
      !result.assignments.some(
        (a) =>
          a.userId === "alice" &&
          a.typeId === "briefing" &&
          a.dateKey === "2026-09-01",
      ),
    );
    // Alice already busy on 2026-09-01
    assert.ok(
      !result.assignments.some(
        (a) => a.userId === "alice" && a.dateKey === "2026-09-01",
      ),
    );
  });

  it("restricted profile only assigns allowed shift types", () => {
    const quotas = [
      {
        userId: "dana",
        typeId: "briefing",
        minCount: 4,
        maxCount: 4,
        isFixed: true,
      },
      { userId: "dana", typeId: "repo", minCount: 0, maxCount: 0, isFixed: true },
      {
        userId: "dana",
        typeId: "council",
        minCount: 0,
        maxCount: 0,
        isFixed: true,
      },
    ];
    assert.equal(isRestrictedProfile("dana", quotas, 3), true);
    assert.equal(isTypeEligible("dana", "briefing", quotas, 3), true);
    assert.equal(isTypeEligible("dana", "repo", quotas, 3), false);

    const result = generateProposal(
      baseInput({
        members: [{ userId: "dana", name: "Dana", fixedDayOff: null }],
        quotas,
      }),
    );
    assert.ok(
      result.assignments.every(
        (a) => a.userId !== "dana" || a.typeId === "briefing",
      ),
    );
    const briefings = result.assignments.filter(
      (a) => a.userId === "dana" && a.typeId === "briefing",
    );
    assert.equal(briefings.length, 4);
  });

  it("partial quotas still allow other shift types", () => {
    const quotas = [
      {
        userId: "alice",
        typeId: "briefing",
        minCount: 2,
        maxCount: 2,
        isFixed: true,
      },
    ];
    assert.equal(isRestrictedProfile("alice", quotas, 3), false);

    const result = generateProposal(baseInput({ quotas }));
    const aliceRepo = result.assignments.filter(
      (a) => a.userId === "alice" && a.typeId === "repo",
    );
    assert.ok(aliceRepo.length >= 1);
  });

  it("explicit max 0 blocks a shift type without restricting the whole profile", () => {
    const quotas = [
      {
        userId: "alice",
        typeId: "briefing",
        minCount: 1,
        maxCount: 1,
        isFixed: true,
      },
      { userId: "alice", typeId: "repo", minCount: 0, maxCount: 0, isFixed: true },
    ];
    assert.equal(isRestrictedProfile("alice", quotas, 3), false);
    assert.equal(isTypeEligible("alice", "repo", quotas, 3), false);

    const result = generateProposal(baseInput({ quotas }));
    assert.ok(
      !result.assignments.some(
        (a) => a.userId === "alice" && a.typeId === "repo",
      ),
    );
  });
});
