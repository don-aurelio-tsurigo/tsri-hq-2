import { NextResponse } from "next/server";
import { EMPTY_ARCHIVE_FILTERS } from "@/lib/dam/archive-filters";
import { searchPublishedAssets } from "@/lib/dam/archive-search";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

const PICKER_PAGE_SIZE = 24;
const PAGE_MAX = 200;

export async function GET(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const parsedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage)
    ? Math.min(Math.max(1, Math.floor(parsedPage)), PAGE_MAX)
    : 1;

  const result = await searchPublishedAssets(
    { ...EMPTY_ARCHIVE_FILTERS, q },
    page,
    PICKER_PAGE_SIZE,
  );

  return NextResponse.json({
    assets: result.assets.map((asset) => ({
      id: asset.id,
      fileName: asset.fileName,
      credit: asset.credit,
      altText: asset.altText,
      editParams: asset.editParams,
    })),
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
  });
}
