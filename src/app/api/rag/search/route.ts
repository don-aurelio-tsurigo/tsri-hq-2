import { NextResponse } from "next/server";
import { embedQuery, VoyageEmbedError } from "@/lib/rag/embed-query";
import {
  DEFAULT_RECENCY_WEIGHT,
  DEFAULT_SEARCH_LIMIT,
  MAX_QUERY_CHARS,
  searchRagChunks,
} from "@/lib/rag/search";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

type SearchBody = {
  query?: unknown;
  limit?: unknown;
  recencyWeight?: unknown;
  author?: unknown;
  tag?: unknown;
};

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export async function POST(request: Request) {
  // Cost protection on deployed instances; local curl stays frictionless.
  if (process.env.NODE_ENV === "production") {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const query = asOptionalString(body.query);
  if (!query) {
    return NextResponse.json(
      { error: "query missing or empty" },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `query too long (max ${MAX_QUERY_CHARS} characters)` },
      { status: 400 },
    );
  }

  const limit = asOptionalNumber(body.limit) ?? DEFAULT_SEARCH_LIMIT;
  const recencyWeight =
    asOptionalNumber(body.recencyWeight) ?? DEFAULT_RECENCY_WEIGHT;
  if (limit < 1) {
    return NextResponse.json({ error: "limit must be >= 1" }, { status: 400 });
  }
  if (recencyWeight < 0) {
    return NextResponse.json(
      { error: "recencyWeight must be >= 0" },
      { status: 400 },
    );
  }

  const author = asOptionalString(body.author);
  const tag = asOptionalString(body.tag);

  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (err) {
    const message =
      err instanceof VoyageEmbedError
        ? err.message
        : "Voyage Embedding fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const results = await searchRagChunks({
      queryEmbedding: embedding,
      limit,
      recencyWeight,
      author,
      tag,
    });
    return NextResponse.json(results);
  } catch (err) {
    console.error("[rag/search]", err);
    return NextResponse.json(
      { error: "search query failed" },
      { status: 500 },
    );
  }
}
