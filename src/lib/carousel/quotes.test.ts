import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeQuoteMarks } from "./quotes";

describe("normalizeQuoteMarks", () => {
  it("leaves quotes without inner quotations unchanged", () => {
    assert.equal(
      normalizeQuoteMarks("Das Stück hält sich an die Vorlage.»"),
      "Das Stück hält sich an die Vorlage.»",
    );
    assert.equal(normalizeQuoteMarks(""), "");
  });

  it("turns an inner «…» into ‹…› and keeps the final »", () => {
    assert.equal(
      normalizeQuoteMarks("Sie sagte: «Das reicht nicht.» Und ging.»"),
      "Sie sagte: ‹Das reicht nicht.› Und ging.»",
    );
  });

  it("handles an inner quotation right before the final »", () => {
    assert.equal(
      normalizeQuoteMarks("Sie sagte: «Nein.»»"),
      "Sie sagte: ‹Nein.›»",
    );
  });

  it("treats a trailing » as inner when its quotation is still open", () => {
    assert.equal(normalizeQuoteMarks("Sie sagte: «Nein»"), "Sie sagte: ‹Nein›");
  });

  it("converts straight and typographic double quotes", () => {
    assert.equal(
      normalizeQuoteMarks('Der "Klassiker" und „die Falle“ und “mehr”.»'),
      "Der ‹Klassiker› und ‹die Falle› und ‹mehr›.»",
    );
  });

  it("drops a leading outer « (drawn by the template)", () => {
    assert.equal(normalizeQuoteMarks("«Ganzes Zitat.»"), "Ganzes Zitat.»");
  });

  it("keeps a leading inner quotation", () => {
    assert.equal(
      normalizeQuoteMarks("«Nein», sagte sie.»"),
      "‹Nein›, sagte sie.»",
    );
  });

  it("works around formatting tags and entities", () => {
    assert.equal(
      normalizeQuoteMarks("Ein <b>&laquo;Klassiker&raquo;</b> eben.»</b>"),
      "Ein <b>‹Klassiker›</b> eben.»</b>",
    );
  });

  it("leaves single guillemets and apostrophes alone", () => {
    assert.equal(
      normalizeQuoteMarks("Er sagte ‹Hallo› und ging’s an.»"),
      "Er sagte ‹Hallo› und ging’s an.»",
    );
  });
});
