import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  htmlToWikiMarkdown,
  normalizeWikiMarkdownTables,
  sanitizeTablesForMarkdown,
} from "@/lib/wiki-markdown-tables";

describe("wiki-markdown-tables", () => {
  it("converts TipTap tables with colgroup to GFM", () => {
    const html = `<table class="wiki-table" style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Kanal</p></th><th colspan="1" rowspan="1"><p>Kennzahl</p></th></tr><tr><td colspan="1" rowspan="1"><p>Website</p></td><td colspan="1" rowspan="1"><p>110'000</p></td></tr></tbody></table>`;
    const md = htmlToWikiMarkdown(html);
    assert.match(md, /\| Kanal \| Kennzahl \|/);
    assert.match(md, /\| --- \| --- \|/);
    assert.match(md, /\| Website \| 110'000 \|/);
    assert.equal(md.includes("<table"), false);
  });

  it("strips colgroup before conversion", () => {
    const cleaned = sanitizeTablesForMarkdown(
      `<table><colgroup><col></colgroup><tbody><tr><th>A</th></tr></tbody></table>`,
    );
    assert.equal(cleaned.includes("colgroup"), false);
  });

  it("normalizes HTML tables already stored in markdown bodies", () => {
    const source = `## Titel\n\n<table class="wiki-table"><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>\n\nText.`;
    const out = normalizeWikiMarkdownTables(source);
    assert.match(out, /\| A \| B \|/);
    assert.equal(out.includes("<table"), false);
    assert.match(out, /Text\./);
  });
});
