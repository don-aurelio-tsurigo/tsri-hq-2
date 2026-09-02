import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWikiTree,
  reorderWikiSiblingNodes,
  type WikiPageNode,
} from "@/lib/wiki-shared";

function page(
  partial: Pick<WikiPageNode, "id" | "title" | "parentId" | "sortOrder">,
): WikiPageNode {
  return {
    slug: partial.id,
    pinned: false,
    ...partial,
  };
}

describe("wiki-shared reorder", () => {
  it("reorders siblings before a target", () => {
    const pages = [
      page({ id: "a", title: "A", parentId: null, sortOrder: 0 }),
      page({ id: "b", title: "B", parentId: null, sortOrder: 1 }),
      page({ id: "c", title: "C", parentId: null, sortOrder: 2 }),
      page({ id: "child", title: "Child", parentId: "a", sortOrder: 0 }),
    ];
    const next = reorderWikiSiblingNodes(pages, "c", "a", "before");
    assert.ok(next);
    const roots = buildWikiTree(next!).get(null) ?? [];
    assert.deepEqual(
      roots.map((p) => p.id),
      ["c", "a", "b"],
    );
    assert.equal(
      next!.find((p) => p.id === "child")?.sortOrder,
      0,
    );
  });

  it("rejects moves across different parents", () => {
    const pages = [
      page({ id: "a", title: "A", parentId: null, sortOrder: 0 }),
      page({ id: "b", title: "B", parentId: "a", sortOrder: 0 }),
    ];
    assert.equal(reorderWikiSiblingNodes(pages, "b", "a", "after"), null);
  });
});
