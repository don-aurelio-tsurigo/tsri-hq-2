import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  htmlToWikiMarkdown,
  normalizeWikiMarkdown,
  normalizeWikiMarkdownTables,
  sanitizeTablesForMarkdown,
  stripEmptyWikiBlocks,
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

  it("drops empty paragraphs instead of preserving them as spacers", () => {
    const md = htmlToWikiMarkdown(
      `<p>Eins</p><p></p><p>Drei</p><p><br class="ProseMirror-trailingBreak"></p>`,
    );
    assert.equal(md, "Eins\n\nDrei");
    assert.equal(md.includes("\u00a0"), false);
  });

  it("converts a newly inserted empty TipTap table without crashing", () => {
    const html = `<table class="wiki-table"><colgroup><col><col><col></colgroup><tbody><tr><th><p></p></th><th><p></p></th><th><p></p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>`;
    const md = htmlToWikiMarkdown(html);
    assert.match(md, /\|/);
    assert.match(md, /\| --- \|/);
  });

  it("drops empty table rows", () => {
    const md = htmlToWikiMarkdown(
      `<table><tbody><tr><th><p>A</p></th></tr><tr><td><p>1</p></td></tr><tr><td><p></p></td></tr></tbody></table>`,
    );
    assert.equal(md, "| A |\n| --- |\n| 1 |");
  });

  it("keeps multiple paragraphs inside a table cell", () => {
    const md = htmlToWikiMarkdown(
      `<table><tbody><tr><th><p>Kopf</p></th></tr><tr><td><p>Zelle 1</p><p>Zelle 2</p></td></tr></tbody></table>`,
    );
    assert.match(md, /Zelle 1<br>Zelle 2/);
  });

  it("strips empty blocks from html", () => {
    const cleaned = stripEmptyWikiBlocks(
      `<p>A</p><p> </p><table><tbody><tr><td><p>x</p></td></tr><tr><td></td></tr></tbody></table>`,
    );
    assert.equal(cleaned.includes("<p> </p>"), false);
    assert.match(cleaned, /<tr><td><p>x<\/p><\/td><\/tr>/);
    assert.equal((cleaned.match(/<tr/gi) ?? []).length, 1);
  });

  it("removes legacy nbsp-only lines when normalizing", () => {
    const out = normalizeWikiMarkdown("Eins\n\n\u00a0\n\nZwei");
    assert.equal(out, "Eins\n\nZwei");
  });
});
