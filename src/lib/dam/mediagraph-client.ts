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

function totalFromSearch(data: unknown, headers: Headers, fallback: number): number {
  const fromHeader = totalFromHeaders(headers, 0);
  if (fromHeader > 0) return fromHeader;
  if (data && typeof data === "object") {
    const n = Number((data as { total_entries?: unknown }).total_entries);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

export async function searchAssetsPage(
  client: MediagraphClient,
  opts: {
    page: number;
    perPage: number;
    collectionId?: string;
    omitChildCollections?: boolean;
    snapshotTimestamp?: number;
    ids?: Array<number | string>;
  },
) {
  const params = new URLSearchParams({
    page: String(opts.page),
    per_page: String(opts.perPage),
    sort: "created_at",
    order: "asc",
    aasm_state: "processed",
  });
  if (opts.snapshotTimestamp) {
    params.set("snapshot_timestamp", String(opts.snapshotTimestamp));
  }
  for (const id of opts.ids ?? []) {
    params.append("ids[]", String(id));
  }
  if (opts.collectionId) params.set("collection_id", opts.collectionId);
  if (opts.omitChildCollections) params.set("omit_child_collections", "true");
  const { data, headers } = await mediagraphJson<unknown>(
    client,
    `/assets/search?${params.toString()}`,
  );
  const assets = asList<Record<string, unknown>>(data, ["assets", "data", "results"]);
  return { assets, total: totalFromSearch(data, headers, assets.length) };
}

function numberIds(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Full processed-asset ID list. Null if Mediagraph omitted `all_ids`. */
export async function searchAllAssetIds(client: MediagraphClient): Promise<number[] | null> {
  const params = new URLSearchParams({
    all_ids: "true",
    aasm_state: "processed",
    per_page: "1",
  });
  const { data, headers } = await mediagraphJson<unknown>(
    client,
    `/assets/search?${params.toString()}`,
  );
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const ids = numberIds(
    record.ids ?? record.all_ids ?? record.ids_in_selection ?? record.asset_ids,
  );
  if (ids.length === 0) return null;
  const total = totalFromSearch(data, headers, ids.length);
  if (ids.length < total) {
    console.warn(
      `[mediagraph] all_ids returned ${ids.length} of ${total} — falling back to pages`,
    );
    return null;
  }
  return ids;
}

export async function listRightsPackages(client: MediagraphClient) {
  const { data } = await mediagraphJson<unknown>(client, "/rights_packages?per_page=100");
  const packages = asList<Record<string, unknown>>(data, [
    "rights_packages",
    "data",
    "results",
  ]);
  return packages.map((item) => ({
    id: item.id ?? null,
    name: item.name ?? null,
    status: item.status ?? item.rights_status ?? null,
  }));
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
