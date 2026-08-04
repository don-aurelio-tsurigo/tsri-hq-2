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
