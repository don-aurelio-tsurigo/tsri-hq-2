const API_BASE = "https://api.mediagraph.io/api";

export type MediagraphClient = {
  token: string;
  orgId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

export function mediagraphClientFromEnv(): MediagraphClient {
  return {
    token: requiredEnv("MEDIAGRAPH_TOKEN"),
    orgId: requiredEnv("MEDIAGRAPH_ORG_ID"),
  };
}

function authHeader(token: string): string {
  return `Basic ${Buffer.from(`:${token}`, "utf8").toString("base64")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mediagraphFetch(
  client: MediagraphClient,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let delay = 2000;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(client.token),
        OrganizationId: client.orgId,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      redirect: "follow",
    });
    if (res.status !== 429 && res.status !== 503) return res;
    const retryAfter = Number(res.headers.get("Retry-After"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
    console.warn(`[mediagraph] HTTP ${res.status}, retry in ${wait}ms (${path})`);
    await sleep(wait);
    delay = Math.min(delay * 2, 60_000);
  }
  throw new Error(`Mediagraph Rate-Limit für ${path}`);
}

export async function mediagraphJson<T>(
  client: MediagraphClient,
  path: string,
): Promise<{ data: T; headers: Headers }> {
  const res = await mediagraphFetch(client, path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mediagraph ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return { data: (await res.json()) as T, headers: res.headers };
}

function asList<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

export function totalFromHeaders(headers: Headers, fallback: number): number {
  const raw =
    headers.get("Total-Entries") ??
    headers.get("total-entries") ??
    headers.get("X-Total-Entries");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function searchAssetsPage(
  client: MediagraphClient,
  opts: {
    page: number;
    perPage: number;
    collectionId?: string;
    omitChildCollections?: boolean;
  },
) {
  const params = new URLSearchParams({
    page: String(opts.page),
    per_page: String(opts.perPage),
    sortField: "created_at",
    sortOrder: "ascend",
    aasm_state: "processed",
  });
  if (opts.collectionId) params.set("collection_id", opts.collectionId);
  if (opts.omitChildCollections) params.set("omit_child_collections", "true");
  const { data, headers } = await mediagraphJson<unknown>(
    client,
    `/assets/search?${params.toString()}`,
  );
  const assets = asList<Record<string, unknown>>(data, ["assets", "data", "results"]);
  return { assets, total: totalFromHeaders(headers, assets.length) };
}

export async function listCollectionsPage(
  client: MediagraphClient,
  page: number,
  perPage: number,
) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const { data, headers } = await mediagraphJson<unknown>(
    client,
    `/collections?${params.toString()}`,
  );
  const collections = asList<Record<string, unknown>>(data, [
    "collections",
    "data",
    "results",
  ]);
  return { collections, total: totalFromHeaders(headers, collections.length) };
}

export async function fetchCreatorTagName(
  client: MediagraphClient,
  id: string,
): Promise<string | null> {
  try {
    const { data } = await mediagraphJson<unknown>(client, `/creator_tags/${id}`);
    if (data && typeof data === "object") {
      const record = data as { name?: unknown; creator_tag?: { name?: unknown } };
      const name = record.name ?? record.creator_tag?.name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  } catch (error) {
    console.warn(`[mediagraph] creator_tag ${id} failed`, error);
  }
  return null;
}

export async function downloadAssetBytes(
  client: MediagraphClient,
  assetId: string,
  size: "original" | "full",
): Promise<Buffer> {
  const res = await mediagraphFetch(
    client,
    `/assets/${encodeURIComponent(assetId)}/download?size=${size}`,
    { headers: { Accept: "*/*" } },
  );
  if (!res.ok) {
    throw new Error(`Download HTTP ${res.status} (${size})`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const json = (await res.json()) as { url?: string; download_url?: string };
    const url = json.url || json.download_url;
    if (!url) throw new Error("Download-JSON ohne URL.");
    const file = await fetch(url, { redirect: "follow" });
    if (!file.ok) throw new Error(`Signed download HTTP ${file.status}`);
    return Buffer.from(await file.arrayBuffer());
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Rendition HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
