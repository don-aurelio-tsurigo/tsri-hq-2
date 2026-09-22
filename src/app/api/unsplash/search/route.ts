import { NextResponse } from "next/server";
import { getActiveMembershipContext } from "@/lib/session";
import {
  getUnsplashAccessKey,
  mapUnsplashPhoto,
  unsplashAuthHeaders,
  type UnsplashPickerPhoto,
} from "@/lib/unsplash";

export const runtime = "nodejs";

const PER_PAGE = 24;
const PAGE_MAX = 50;

type UnsplashSearchResponse = {
  total?: number;
  total_pages?: number;
  results?: unknown[];
};

type UnsplashListResponse = unknown[];

export async function GET(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessKey = getUnsplashAccessKey();
  if (!accessKey) {
    return NextResponse.json(
      { error: "UNSPLASH_ACCESS_KEY fehlt in der Umgebung." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const parsedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage)
    ? Math.min(Math.max(1, Math.floor(parsedPage)), PAGE_MAX)
    : 1;

  const params = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
  });

  const endpoint = q
    ? `https://api.unsplash.com/search/photos?${params}&orientation=portrait&query=${encodeURIComponent(q)}`
    : `https://api.unsplash.com/photos?${params}&order_by=popular`;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      headers: unsplashAuthHeaders(accessKey),
      next: { revalidate: 0 },
    });
  } catch {
    return NextResponse.json(
      { error: "Unsplash ist nicht erreichbar." },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.warn("[unsplash] search failed", upstream.status, detail.slice(0, 200));
    return NextResponse.json(
      {
        error:
          upstream.status === 403 || upstream.status === 401
            ? "Unsplash-API-Key ungültig oder Rate-Limit erreicht."
            : "Unsplash-Suche fehlgeschlagen.",
      },
      { status: 502 },
    );
  }

  const photos: UnsplashPickerPhoto[] = [];
  let total = 0;
  let pageCount = 0;

  if (q) {
    const data = (await upstream.json()) as UnsplashSearchResponse;
    total = typeof data.total === "number" ? data.total : 0;
    pageCount = typeof data.total_pages === "number" ? data.total_pages : 0;
    for (const row of data.results ?? []) {
      const mapped = mapUnsplashPhoto(row as Parameters<typeof mapUnsplashPhoto>[0]);
      if (mapped) photos.push(mapped);
    }
  } else {
    const data = (await upstream.json()) as UnsplashListResponse;
    for (const row of data) {
      const mapped = mapUnsplashPhoto(row as Parameters<typeof mapUnsplashPhoto>[0]);
      if (mapped) photos.push(mapped);
    }
    // List endpoint has no total; allow paging until a short page.
    total = photos.length < PER_PAGE && page === 1 ? photos.length : page * PER_PAGE + 1;
    pageCount = photos.length < PER_PAGE ? page : page + 1;
  }

  return NextResponse.json({
    photos,
    total,
    page,
    pageCount,
  });
}
