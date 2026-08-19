import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultCollectionName,
  suggestedRightsType,
} from "./upload-defaults.ts";

describe("defaultCollectionName", () => {
  it("uses the name before slash and a Zurich date", () => {
    const name = defaultCollectionName(
      "Paul Muster/Tsüri.ch",
      new Date("2026-08-17T10:00:00.000Z"),
    );
    assert.equal(name, "2026-08-17 – Paul Muster");
  });
});

describe("suggestedRightsType", () => {
  const me = "Elio Donauer/Tsüri.ch";
  it("marks the own photographer credit as own", () => {
    assert.equal(suggestedRightsType(me, me), "own");
  });
  it("marks any other name as provided", () => {
    assert.equal(suggestedRightsType("Paul Muster/Tsüri.ch", me), "provided");
  });
  it("defaults empty credit to provided", () => {
    assert.equal(suggestedRightsType("", me), "provided");
  });
});
