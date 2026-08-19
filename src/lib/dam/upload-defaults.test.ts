import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultCollectionName } from "./upload-defaults.ts";

describe("defaultCollectionName", () => {
  it("uses the name before slash and a Zurich date", () => {
    const name = defaultCollectionName(
      "Paul Muster/Tsüri.ch",
      new Date("2026-08-17T10:00:00.000Z"),
    );
    assert.equal(name, "2026-08-17 – Paul Muster");
  });
});
