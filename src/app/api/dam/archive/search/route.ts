import { NextResponse } from "next/server";
import {
  parseArchiveFilters,
  parseArchivePage,
  searchPublishedAssets,
} from "@/lib/dam/archive-search";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    record[key] = all.length > 1 ? all : (all[0] ?? "");
  }
  const filters = parseArchiveFilters(record);
  const page = parseArchivePage(record);

  try {
    const result = await searchPublishedAssets(filters, page);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[dam] archive search api failed", error);
    return NextResponse.json(
      { error: "Suche fehlgeschlagen." },
      { status: 500 },
    );
  }
}
