import assert from "node:assert/strict";
import { describe, it } from "node:test";
import exifr from "exifr";
import sharp from "sharp";
import { renderPublishedMaster } from "./apply-edits.ts";
import { DEFAULT_EDIT_PARAMS } from "./edit-params.ts";
import {
  buildDamExportMetadata,
  formatExifDateTime,
} from "./export-metadata.ts";

describe("formatExifDateTime", () => {
  it("formats UTC as EXIF DateTime", () => {
    assert.equal(
      formatExifDateTime("2024-06-15T12:30:45.000Z"),
      "2024:06:15 12:30:45",
    );
  });
});

describe("buildDamExportMetadata", () => {
  it("maps credit, alt, keywords, notes, rights and takenAt", () => {
    const payload = buildDamExportMetadata({
      credit: "Ada Lovelace",
      altText: "Velofahrer:in auf der Limmatstrasse",
      keywords: ["zürich", "velo", "Zürich"],
      notes: "Innenredaktion",
      rightsType: "own",
      takenAt: "2024-06-15T12:30:45.000Z",
    });
    assert.ok(payload?.exif?.IFD0);
    assert.equal(payload.exif.IFD0.Artist, "Ada Lovelace");
    assert.equal(payload.exif.IFD0.Copyright, "Ada Lovelace / Tsüri.ch");
    assert.equal(
      payload.exif.IFD0.ImageDescription,
      "Velofahrer:in auf der Limmatstrasse",
    );
    assert.equal(payload.exif.IFD2?.DateTimeOriginal, "2024:06:15 12:30:45");
    assert.ok(payload.xmp?.includes("Ada Lovelace"));
    assert.ok(payload.xmp?.includes("<rdf:li>zürich</rdf:li>"));
    assert.ok(payload.xmp?.includes("<rdf:li>velo</rdf:li>"));
    assert.ok(!payload.xmp?.includes("<rdf:li>Zürich</rdf:li>"));
    assert.ok(payload.xmp?.includes("Innenredaktion"));
    assert.ok(payload.xmp?.includes("Alle Nutzungsrechte liegen bei Tsüri"));
  });

  it("skips placeholder credit and empty payload", () => {
    assert.equal(buildDamExportMetadata({ credit: "—" }), null);
    assert.equal(buildDamExportMetadata({ credit: "  ", keywords: [] }), null);
  });

  it("escapes XML special characters in XMP", () => {
    const payload = buildDamExportMetadata({
      credit: 'A & B <C>',
      keywords: ["a&b"],
    });
    assert.ok(payload?.xmp?.includes("A &amp; B &lt;C&gt;"));
    assert.ok(payload?.xmp?.includes("a&amp;b"));
  });
});

describe("renderPublishedMaster editorial metadata", () => {
  it("embeds EXIF and XMP into the exported jpeg", async () => {
    const input = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 40, g: 50, b: 60 },
      },
    })
      .png()
      .toBuffer();

    const published = await renderPublishedMaster(input, DEFAULT_EDIT_PARAMS, {
      credit: "Test Credit",
      altText: "Beschreibung",
      keywords: ["demo", "archiv"],
      notes: "Notiz",
      rightsType: "provided",
      takenAt: new Date("2023-01-02T08:09:10.000Z"),
    });

    const parsed = (await exifr.parse(published.buffer, {
      tiff: true,
      xmp: true,
      mergeOutput: true,
    })) as Record<string, unknown>;

    assert.equal(parsed.Artist, "Test Credit");
    // Classic EXIF is ASCII-only in Sharp/libexif (ü → u); full text lives in XMP.
    assert.match(String(parsed.Copyright), /^Test Credit/);
    assert.equal(parsed.ImageDescription, "Beschreibung");
    assert.equal(parsed.Credit, "Test Credit");
    assert.deepEqual(parsed.subject, ["demo", "archiv"]);
    assert.equal(parsed.Instructions, "Notiz");
    assert.equal(parsed.Source, "Zur Verfügung gestellt");
    assert.ok(parsed.DateTimeOriginal);
  });
});
