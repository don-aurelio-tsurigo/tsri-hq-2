import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveVideoEmbed } from "@/lib/wiki-embeds";

describe("wiki-embeds", () => {
  it("resolves loom share and embed urls", () => {
    const share = resolveVideoEmbed(
      "https://www.loom.com/share/abcdef0123456789abcdef0123456789",
    );
    assert.ok(share);
    assert.equal(share.provider, "loom");
    assert.equal(
      share.src,
      "https://www.loom.com/embed/abcdef0123456789abcdef0123456789",
    );

    const embed = resolveVideoEmbed(
      "https://loom.com/embed/abcdef0123456789abcdef0123456789",
    );
    assert.ok(embed);
    assert.equal(embed.provider, "loom");
  });

  it("rejects non-video urls", () => {
    assert.equal(resolveVideoEmbed("https://example.com/watch"), null);
  });
});
