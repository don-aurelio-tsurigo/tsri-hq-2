import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hyphenateHtml, hyphenateText } from "./hyphenate";

const show = (text: string) => text.replace(/\u00AD/g, "|");

describe("hyphenateText", () => {
  it("adds break points to long words, incl. parts of hyphenated compounds", () => {
    assert.equal(
      show(hyphenateText("auf dem backsteinbraun-asphaltgrauen Areal")),
      "auf dem back|stein|braun-asphalt|grau|en Are|al",
    );
    assert.equal(
      show(hyphenateText("des benachbarten Schlachtbetriebs")),
      "des be|nach|bar|ten Schlacht|be|triebs",
    );
  });

  it("keeps at least 2 letters before and after every break", () => {
    assert.equal(show(hyphenateText("Wiese Areal")), "Wie|se Are|al");
    assert.equal(show(hyphenateText("Abend")), "Abend");
  });

  it("leaves short words alone", () => {
    assert.equal(hyphenateText("In der Ecke gibt es"), "In der Ecke gibt es");
  });

  it("does not touch markup, only text between tags", () => {
    assert.equal(
      show(hyphenateHtml("<b>Schlachthof</b><br/>Text")),
      "<b>Schlacht|hof</b><br/>Text",
    );
  });

  it("is stable when applied twice", () => {
    const once = hyphenateText("backsteinbraun-asphaltgrauen Quartierbevölkerung");
    assert.equal(hyphenateText(once), once);
  });
});
