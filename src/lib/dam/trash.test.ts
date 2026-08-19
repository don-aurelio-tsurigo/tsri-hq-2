import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeleteAsset } from "./can-delete.ts";
import { r2KeysForAsset } from "./r2-keys.ts";
import {
  INCOMPLETE_BATCH_RETENTION_DAYS,
  REJECTED_RETENTION_DAYS,
  TRASH_RETENTION_DAYS,
  incompleteBatchCutoffDate,
  rejectedCutoffDate,
  trashCutoffDate,
  trashDaysRemaining,
} from "./trash-policy.ts";

describe("canDeleteAsset", () => {
  it("allows any signed-in member for now", () => {
    assert.equal(
      canDeleteAsset(
        { id: "user-1" },
        { id: "asset-1", status: "published", uploadedBy: "other" },
      ),
      true,
    );
  });
});

describe("trash retention", () => {
  it("counts remaining days from deletedAt", () => {
    const deletedAt = new Date("2026-07-18T10:00:00.000Z");
    const now = new Date("2026-08-17T10:00:00.000Z");
    assert.equal(trashDaysRemaining(deletedAt, now), 0);
    assert.equal(TRASH_RETENTION_DAYS, 30);
    assert.equal(REJECTED_RETENTION_DAYS, 14);
  });

  it("keeps 30 days on the day of deletion", () => {
    const deletedAt = new Date("2026-08-17T08:00:00.000Z");
    const now = new Date("2026-08-17T18:00:00.000Z");
    assert.equal(trashDaysRemaining(deletedAt, now), 30);
  });

  it("builds cutoffs 30 and 14 days back", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    assert.equal(trashCutoffDate(now).toISOString(), "2026-07-18T12:00:00.000Z");
    assert.equal(rejectedCutoffDate(now).toISOString(), "2026-08-03T12:00:00.000Z");
    assert.equal(
      incompleteBatchCutoffDate(now).toISOString(),
      "2026-08-16T12:00:00.000Z",
    );
    assert.equal(INCOMPLETE_BATCH_RETENTION_DAYS, 1);
  });
});

describe("r2KeysForAsset", () => {
  it("includes master, thumb and web derivatives", () => {
    assert.deepEqual(r2KeysForAsset("archive/u1/a1/file.jpg"), [
      "archive/u1/a1/file.jpg",
      "archive/u1/a1/file_thumb.webp",
      "archive/u1/a1/file_web.webp",
    ]);
  });
});
