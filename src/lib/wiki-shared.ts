/** Client-safe wiki helpers — no DB / Node imports. */

export type WikiPageNode = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  pinned: boolean;
};

export type WikiPageDetail = WikiPageNode & {
  body: string;
  updatedAt: Date;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string };
};

export function buildWikiTree(pages: WikiPageNode[]) {
  const byParent = new Map<string | null, WikiPageNode[]>();
  for (const page of pages) {
    const key = page.parentId;
    const list = byParent.get(key) ?? [];
    list.push(page);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "de"),
    );
  }
  return byParent;
}

function compareWikiSiblings(a: WikiPageNode, b: WikiPageNode) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "de");
}

/**
 * Move a page among its siblings (same parentId). Returns null if the move
 * is invalid (missing ids or different parents).
 */
export function reorderWikiSiblingNodes(
  pages: WikiPageNode[],
  draggedId: string,
  targetId: string,
  place: "before" | "after",
): WikiPageNode[] | null {
  if (draggedId === targetId) return null;
  const dragged = pages.find((page) => page.id === draggedId);
  const target = pages.find((page) => page.id === targetId);
  if (!dragged || !target) return null;
  if (dragged.parentId !== target.parentId) return null;

  const siblings = pages
    .filter((page) => page.parentId === dragged.parentId)
    .sort(compareWikiSiblings);
  const withoutDragged = siblings.filter((page) => page.id !== draggedId);
  let insertAt = withoutDragged.findIndex((page) => page.id === targetId);
  if (insertAt < 0) return null;
  if (place === "after") insertAt += 1;
  withoutDragged.splice(insertAt, 0, dragged);

  const orderById = new Map(
    withoutDragged.map((page, index) => [page.id, index]),
  );

  return pages.map((page) => {
    const nextOrder = orderById.get(page.id);
    if (nextOrder === undefined || page.sortOrder === nextOrder) return page;
    return { ...page, sortOrder: nextOrder };
  });
}
