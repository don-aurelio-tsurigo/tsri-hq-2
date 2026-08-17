import { NextResponse } from "next/server";
import {
  searchArchiveCollections,
  searchArchiveKeywords,
} from "@/lib/dam/archive-search";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q") ?? "";

  if (type === "keywords") {
    return NextResponse.json({ options: await searchArchiveKeywords(q) });
  }
  if (type === "collections") {
    return NextResponse.json({ options: await searchArchiveCollections(q) });
  }

  return NextResponse.json({ error: "Ungültiger Typ." }, { status: 400 });
}
