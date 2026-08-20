import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { looksLikeImageBytes } from "@/lib/dam/accept";
import { extractExif } from "@/lib/dam/exif";
import { buildMediagraphArchiveKey, derivativeKey, sanitizeFileTitle } from "@/lib/dam/filename";
import { createMasterImage } from "@/lib/dam/master";
import {
  downloadAssetBytes,
  downloadUrl,
  fetchCreatorTagName,
  listCollectionsPage,
  listRightsPackages,
  mediagraphClientFromEnv,
  searchAllAssetIds,
  searchAssetsPage,
  type MediagraphClient,
} from "@/lib/dam/mediagraph-client";
import {
  MEDIAGRAPH_IMPORT_SOURCE,
  assetGuid,
  collectionNamesFromAsset,
  creditFromAsset,
  defaultRightsIdMap,
  flattenCollectionName,
  gpsFromAsset,
  isImageAsset,
  keywordsFromTags,
  mapRightsType,
  shouldUseFullRendition,
  takenAtFromAsset,
  type MediagraphAsset,
  type MediagraphCollectionRef,
} from "@/lib/dam/mediagraph-map";
import { prisma } from "@/lib/db";
import { putObject } from "@/lib/r2";
import type { Prisma } from "@/generated/prisma/client";

sharp.cache(false);
sharp.concurrency(1);

const IMPORT_BATCH_CREDIT = "Mediagraph-Import";
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export type ImportCliOptions = {
  test: boolean;
  collectionsOnly: boolean;
  dryRun: boolean;
  concurrency: number;
  reportDir: string;
  uploaderUserId: string;
};

type JsonRecord = Record<string, unknown>;

function asAsset(raw: JsonRecord): MediagraphAsset {
  return raw as unknown as MediagraphAsset;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      await fn(next);
    }
  });
  await Promise.all(workers);
}

function readJsonArray(path: string): JsonRecord[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as JsonRecord[]) : [];
  } catch {
    return [];
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function parseImportArgs(argv: string[]): ImportCliOptions {
  const test = argv.includes("--test");
  return {
    test,
    collectionsOnly: argv.includes("--collections"),
    dryRun: argv.includes("--dry-run"),
    concurrency: Number(
      argv.find((arg) => arg.startsWith("--concurrency="))?.slice(14) ??
        process.env.MEDIAGRAPH_CONCURRENCY ??
        3,
    ) || 3,
    reportDir:
      process.env.MEDIAGRAPH_REPORT_DIR?.trim() ||
      join(process.cwd(), "tmp", "mediagraph-import"),
    uploaderUserId:
      process.env.MEDIAGRAPH_UPLOADER_USER_ID?.trim() ||
      process.env.MEDIAGRAPH_UPLOADER_EMAIL?.trim() ||
      "",
  };
}

async function resolveUploaderId(opts: ImportCliOptions): Promise<string> {
  if (/^[a-z0-9]+$/i.test(opts.uploaderUserId) && !opts.uploaderUserId.includes("@")) {
    const user = await prisma.user.findUnique({
      where: { id: opts.uploaderUserId },
      select: { id: true },
    });
    if (user) return user.id;
  }
  const email =
    process.env.MEDIAGRAPH_UPLOADER_EMAIL?.trim() ||
    (opts.uploaderUserId.includes("@") ? opts.uploaderUserId : "");
  if (email) {
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (user) return user.id;
  }
  throw new Error(
    "MEDIAGRAPH_UPLOADER_USER_ID oder MEDIAGRAPH_UPLOADER_EMAIL muss auf Elios HQ-User zeigen.",
  );
}

async function ensureImportBatch(uploaderUserId: string): Promise<string> {
  const existing = await prisma.uploadBatch.findFirst({
    where: { uploadedBy: uploaderUserId, credit: IMPORT_BATCH_CREDIT },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.uploadBatch.create({
    data: { uploadedBy: uploaderUserId, credit: IMPORT_BATCH_CREDIT },
    select: { id: true },
  });
  return created.id;
}

async function takeNextSequence(
  state: { value: number; lock: Promise<void> },
): Promise<number> {
  let release!: () => void;
  const previous = state.lock;
  state.lock = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const next = state.value;
    state.value += 1;
    return next;
  } finally {
    release();
  }
}

async function findOrCreateCollection(opts: {
  name: string;
  createdBy: string;
  mediagraphId?: string | null;
}): Promise<string> {
  if (opts.mediagraphId) {
    const byId = await prisma.collection.findUnique({
      where: { mediagraphId: opts.mediagraphId },
      select: { id: true },
    });
    if (byId) {
      if (opts.name) {
        await prisma.collection.update({
          where: { id: byId.id },
          data: { name: opts.name, isPersonal: false },
        });
      }
      return byId.id;
    }
  }
  const byName = await prisma.collection.findFirst({
    where: {
      name: opts.name,
      isPersonal: false,
      ...(opts.mediagraphId ? { mediagraphId: null } : {}),
    },
    select: { id: true },
  });
  if (byName) {
    if (opts.mediagraphId) {
      await prisma.collection.update({
        where: { id: byName.id },
        data: { mediagraphId: opts.mediagraphId },
      });
    }
    return byName.id;
  }
  const created = await prisma.collection.create({
    data: {
      name: opts.name,
      createdBy: opts.createdBy,
      isPersonal: false,
      mediagraphId: opts.mediagraphId ?? undefined,
    },
    select: { id: true },
  });
  return created.id;
}

async function downloadImage(client: MediagraphClient, asset: MediagraphAsset): Promise<Buffer> {
  const id = String(asset.id);
  if (shouldUseFullRendition(asset)) {
    if (asset.full_url) return downloadUrl(asset.full_url);
    return downloadAssetBytes(client, id, "full");
  }
  try {
    const original = await downloadAssetBytes(client, id, "original");
    if (original.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`Original zu gross (${original.byteLength} bytes)`);
    }
    return original;
  } catch (error) {
    if (asset.full_url) {
      console.warn(`[mediagraph] original failed for ${id}, using full_url`, error);
      return downloadUrl(asset.full_url);
    }
    return downloadAssetBytes(client, id, "full");
  }
}

async function importOneAsset(opts: {
  client: MediagraphClient;
  asset: MediagraphAsset;
  uploaderUserId: string;
  batchId: string;
  sequence: { value: number; lock: Promise<void> };
  dryRun: boolean;
  creatorTagCache: Map<string, string | null>;
  reports: {
    errors: JsonRecord[];
    videos: JsonRecord[];
    rightsReview: JsonRecord[];
  };
}): Promise<"imported" | "skipped" | "error"> {
  const { asset, reports } = opts;
  const guid = assetGuid(asset);
  if (!guid) {
    reports.errors.push({ id: asset.id, filename: asset.filename, error: "guid fehlt" });
    return "error";
  }
  if (!isImageAsset(asset)) {
    reports.videos.push({
      id: asset.id,
      guid,
      filename: asset.filename ?? null,
      type: asset.type ?? null,
    });
    return "skipped";
  }

  const existing = await prisma.asset.findUnique({
    where: { mediagraphId: guid },
    select: { id: true },
  });
  if (existing) return "skipped";

  const rightsType = mapRightsType(asset);
  if (!rightsType) {
    reports.rightsReview.push({
      id: asset.id,
      guid,
      filename: asset.filename ?? null,
      rights_package_id: asset.rights_package_id ?? asset.rights_package?.id ?? null,
      rights_package_name: asset.rights_package?.name ?? null,
      rights_status: asset.rights_status ?? null,
    });
    return "skipped";
  }

  let creatorTagName = asset.creator_tag?.name ?? null;
  const tagId = String(asset.creator_tag?.id ?? asset.creator_tag_id ?? "");
  if (!creatorTagName && tagId) {
    if (!opts.creatorTagCache.has(tagId)) {
      opts.creatorTagCache.set(tagId, await fetchCreatorTagName(opts.client, tagId));
    }
    creatorTagName = opts.creatorTagCache.get(tagId) ?? null;
  }

  if (opts.dryRun) return "imported";

  const sequence = await takeNextSequence(opts.sequence);

  const bytes = await downloadImage(opts.client, asset);
  if (!looksLikeImageBytes(bytes)) {
    throw new Error("Download ist kein Bild.");
  }

  const master = await createMasterImage(bytes);
  const [thumb, web] = await Promise.all([
    sharp(master.buffer)
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer(),
    sharp(master.buffer)
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  ]);

  const r2Key = buildMediagraphArchiveKey(guid, master.extension);
  await Promise.all([
    putObject(r2Key, master.buffer, master.contentType),
    putObject(derivativeKey(r2Key, "thumb"), thumb, "image/webp"),
    putObject(derivativeKey(r2Key, "web"), web, "image/webp"),
  ]);

  const exif = await extractExif(bytes);
  const gps = gpsFromAsset(asset);
  const exifJson = {
    ...((exif.json && typeof exif.json === "object" ? exif.json : {}) as Record<string, unknown>),
    ...(gps && !(exif.json as { gps?: unknown } | null)?.gps ? { gps } : {}),
  };
  const collectionIds = [];
  for (const name of collectionNamesFromAsset(asset)) {
    collectionIds.push(
      await findOrCreateCollection({ name, createdBy: opts.uploaderUserId }),
    );
  }

  const baseName = sanitizeFileTitle(
    (asset.filename ?? "mediagraph").replace(/\.[^.]+$/, "") || "mediagraph",
  );
  await prisma.asset.create({
    data: {
      batchId: opts.batchId,
      sequence,
      fileName: `${baseName}.${master.extension}`,
      r2Key,
      status: "published",
      credit: creditFromAsset(asset, creatorTagName),
      rightsType,
      altText: asset.alt_text?.trim() || null,
      keywords: keywordsFromTags(asset.tags),
      mediagraphId: guid,
      importSource: MEDIAGRAPH_IMPORT_SOURCE,
      exif:
        Object.keys(exifJson).length > 0
          ? (exifJson as Prisma.InputJsonValue)
          : exif.json ?? undefined,
      takenAt: takenAtFromAsset(asset, exif.takenAt),
      width: master.width,
      height: master.height,
      uploadedBy: opts.uploaderUserId,
      publishedAt: new Date(),
      collections: {
        create: [...new Set(collectionIds)].map((collectionId) => ({ collectionId })),
      },
    },
  });
  return "imported";
}

export async function runMediagraphAssetImport(opts: ImportCliOptions): Promise<void> {
  const client = mediagraphClientFromEnv();
  const uploaderUserId = await resolveUploaderId(opts);
  mkdirSync(opts.reportDir, { recursive: true });
  const errorPath = join(opts.reportDir, "migration-errors.json");
  const videoPath = join(opts.reportDir, "migration-videos-skipped.json");
  const rightsPath = join(opts.reportDir, "migration-rights-review.json");
  const reports = {
    errors: readJsonArray(errorPath),
    videos: readJsonArray(videoPath),
    rightsReview: readJsonArray(rightsPath),
  };
  const flush = () => {
    writeJson(errorPath, reports.errors);
    writeJson(videoPath, reports.videos);
    writeJson(rightsPath, reports.rightsReview);
  };

  const batchId = opts.dryRun ? "dry-run" : await ensureImportBatch(uploaderUserId);
  const max = opts.dryRun
    ? { _max: { sequence: 0 } }
    : await prisma.asset.aggregate({
        where: { batchId },
        _max: { sequence: true },
      });
  const sequence = {
    value: (max._max.sequence ?? 0) + 1,
    lock: Promise.resolve(),
  };
  const creatorTagCache = new Map<string, string | null>();
  const perPage = opts.test ? 5 : 100;
  const maxPages = opts.test ? 1 : Number.POSITIVE_INFINITY;
  const snapshotTimestamp = Date.now();
  let allIds: number[] | null = null;
  if (!opts.test) {
    try {
      allIds = await searchAllAssetIds(client);
      if (allIds) console.log(`[mediagraph] all_ids ${allIds.length}`);
    } catch (error) {
      console.warn("[mediagraph] all_ids failed, using pages", error);
    }
  }

  if (opts.test) {
    try {
      const packages = await listRightsPackages(client);
      console.log("[mediagraph] rights packages", JSON.stringify(packages));
    } catch (error) {
      console.warn("[mediagraph] could not list rights packages", error);
    }
  }

  let page = 1;
  let total = 0;
  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  while (page <= maxPages) {
    const idChunk =
      allIds && !opts.test
        ? allIds.slice((page - 1) * perPage, page * perPage)
        : undefined;
    if (allIds && !opts.test && (!idChunk || idChunk.length === 0)) break;
    const result = await searchAssetsPage(client, {
      page: allIds && !opts.test ? 1 : page,
      perPage,
      snapshotTimestamp,
      ids: idChunk,
    });
    if (result.assets.length === 0) break;
    total = Math.max(total, allIds?.length ?? result.total, processed + result.assets.length);
    console.log(
      `[mediagraph] page ${page} got ${result.assets.length} (total ${total})`,
    );
    if (opts.test) {
      for (const raw of result.assets) {
        const asset = asAsset(raw);
        console.log(
          "[mediagraph] probe",
          JSON.stringify({
            id: asset.id,
            guid: asset.guid,
            type: asset.type,
            ext: asset.ext,
            filename: asset.filename,
            credit_line: asset.credit_line,
            creator: asset.creator,
            creator_tag: asset.creator_tag,
            rights_package_id: asset.rights_package_id ?? asset.rights_package?.id,
            rights_package_name: asset.rights_package?.name,
            rights_status: asset.rights_status,
            mapped_rights: mapRightsType(asset),
            mapped_credit: creditFromAsset(asset),
            tags: (asset.tags ?? []).map((tag) => ({
              name: tag.name,
              sub_type: tag.sub_type,
            })),
            collections: asset.collections,
            alt_text: asset.alt_text,
            captured_at: asset.captured_at,
            full_url: Boolean(asset.full_url),
          }),
        );
      }
    }
    await mapPool(result.assets, opts.concurrency, async (raw) => {
      const asset = asAsset(raw);
      const filename = String(asset.filename ?? asset.guid ?? asset.id);
      try {
        const status = await importOneAsset({
          client,
          asset,
          uploaderUserId,
          batchId,
          sequence,
          dryRun: opts.dryRun,
          creatorTagCache,
          reports,
        });
        if (status === "imported") imported += 1;
        else if (status === "skipped") skipped += 1;
        else errors += 1;
      } catch (error) {
        errors += 1;
        reports.errors.push({
          id: asset.id,
          guid: asset.guid ?? null,
          filename: asset.filename ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      processed += 1;
      console.log(
        `${processed}/${total || "?"} verarbeitet, ${errors} Fehler, zuletzt: ${filename}`,
      );
    });
    flush();
    if (opts.test) break;
    page += 1;
    if (!allIds && page > Math.max(200, Math.ceil((total || 1) / perPage) + 5)) {
      console.warn(`[mediagraph] page cap at ${page}, total=${total}`);
      break;
    }
  }

  flush();
  console.log(
    `[mediagraph] assets done imported=${imported} skipped=${skipped} errors=${errors} reports=${opts.reportDir}`,
  );
}

export async function runMediagraphCollectionImport(opts: ImportCliOptions): Promise<void> {
  console.log("[mediagraph] collections: resolve uploader…");
  const client = mediagraphClientFromEnv();
  const uploaderUserId = await resolveUploaderId(opts);
  const perPage = opts.test ? 5 : 100;
  const maxPages = opts.test ? 1 : Number.POSITIVE_INFINITY;
  let page = 1;
  let linked = 0;
  let skipped = 0;

  while (page <= maxPages) {
    const result = await listCollectionsPage(client, page, perPage);
    console.log(
      `[mediagraph] collections page ${page} got ${result.collections.length} (total ${result.total})`,
    );
    if (result.collections.length === 0) break;
    for (const raw of result.collections) {
      const collection = raw as MediagraphCollectionRef & { id?: number | string };
      const mediagraphId = collection.id != null ? String(collection.id) : "";
      if (!mediagraphId) continue;
      const name = flattenCollectionName(collection) || `Collection ${mediagraphId}`;
      console.log(`[mediagraph] collection ${mediagraphId} → ${name}`);
      if (opts.dryRun) {
        continue;
      }
      const collectionId = await findOrCreateCollection({
        name,
        createdBy: uploaderUserId,
        mediagraphId,
      });

      let assetPage = 1;
      while (true) {
        const assets = await searchAssetsPage(client, {
          page: assetPage,
          perPage: 100,
          collectionId: mediagraphId,
          omitChildCollections: true,
        });
        if (assets.assets.length === 0) break;
        for (const rawAsset of assets.assets) {
          const guid = assetGuid(asAsset(rawAsset));
          if (!guid) {
            skipped += 1;
            continue;
          }
          const asset = await prisma.asset.findUnique({
            where: { mediagraphId: guid },
            select: { id: true },
          });
          if (!asset) {
            skipped += 1;
            continue;
          }
          await prisma.assetCollection.upsert({
            where: {
              assetId_collectionId: { assetId: asset.id, collectionId },
            },
            create: { assetId: asset.id, collectionId },
            update: {},
          });
          linked += 1;
        }
        if (opts.test) break;
        assetPage += 1;
        if (assetPage > 200) break;
      }
    }
    if (opts.test) break;
    if (result.collections.length === 0) break;
    page += 1;
    if (page > 200) break;
  }

  console.log(`[mediagraph] collections done linked=${linked} skipped=${skipped}`);
}
