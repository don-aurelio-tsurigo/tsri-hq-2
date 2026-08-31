import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  extractExif,
  resolveTakenAt,
  takenAtFromObjectMetadata,
} from "./exif.ts";

describe("extractExif", () => {
  it("reads DateTimeOriginal from a camera JPEG sample", async () => {
    const sample = "/tmp/exif-sample.jpg";
    if (!fs.existsSync(sample)) return;
    const result = await extractExif(fs.readFileSync(sample));
    assert.ok(result.takenAt);
    assert.equal(result.takenAt?.getUTCFullYear(), 2008);
    assert.ok(result.width && result.height);
  });
});

describe("resolveTakenAt", () => {
  it("prefers EXIF, then upload metadata, then existing", () => {
    const exif = new Date("2024-01-01T10:00:00.000Z");
    const meta = new Date("2023-01-01T10:00:00.000Z");
    const existing = new Date("2022-01-01T10:00:00.000Z");

    assert.equal(resolveTakenAt({ exifTakenAt: exif })?.toISOString(), exif.toISOString());
    assert.equal(
      resolveTakenAt({
        metadata: { "taken-at": meta.toISOString() },
      })?.toISOString(),
      meta.toISOString(),
    );
    assert.equal(
      resolveTakenAt({ existing })?.toISOString(),
      existing.toISOString(),
    );
    assert.equal(resolveTakenAt({}), null);
  });

  it("reads taken-at from object metadata", () => {
    const date = new Date("2021-06-02T08:15:00.000Z");
    assert.equal(
      takenAtFromObjectMetadata({ "taken-at": date.toISOString() })?.toISOString(),
      date.toISOString(),
    );
  });
});
