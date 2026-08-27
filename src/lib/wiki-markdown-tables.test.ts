import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  htmlToWikiMarkdown,
  normalizeWikiMarkdown,
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

  it("preserves separate paragraphs and empty spacers", () => {
    const md = htmlToWikiMarkdown(
      `<p>Eins</p><p>Zwei</p><p><br class="ProseMirror-trailingBreak"></p><p>Drei</p>`,
    );
    assert.match(md, /Eins\n\nZwei/);
    assert.match(md, /Drei/);
    assert.equal(md.includes("EinsZwei"), false);
  });

  it("keeps multiple paragraphs inside a table cell", () => {
    const md = htmlToWikiMarkdown(
      `<table><tbody><tr><th><p>Kopf</p></th></tr><tr><td><p>Zelle 1</p><p>Zelle 2</p></td></tr></tbody></table>`,
    );
    assert.match(md, /Zelle 1<br>Zelle 2/);
  });

  it("normalizes leftover HTML paragraphs in stored bodies", () => {
    const out = normalizeWikiMarkdown(
      `<p>Hallo</p><p>Welt</p>\n\nNormaler Markdown-Absatz.`,
    );
    assert.match(out, /Hallo/);
    assert.match(out, /Welt/);
    assert.equal(out.includes("<p>"), false);
    assert.match(out, /Normaler Markdown-Absatz/);
  });
});
