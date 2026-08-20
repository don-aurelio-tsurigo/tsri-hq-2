import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCollectionName } from "./upload-defaults.ts";

describe("defaultCollectionName", () => {
  const date = new Date("2026-08-17T10:00:00.000Z");

  it("uses Kontext after a Zurich date", () => {
    assert.equal(
      defaultCollectionName("Theater Spektakel", date),
      "2026-08-17 – Theater Spektakel",
    );
  });

  it("keeps only the date while Kontext is empty", () => {
    assert.equal(defaultCollectionName("  ", date), "2026-08-17");
  });

  it("uses the first line of Kontext", () => {
    assert.equal(
      defaultCollectionName("Theater Spektakel\nLange Beschreibung", date),
      "2026-08-17 – Theater Spektakel",
    );
  });
});
