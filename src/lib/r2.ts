import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDispositionAttachment } from "@/lib/dam/filename";

export class R2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2ConfigError";
  }
}

export class R2AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2AccessError";
  }
}

function r2ErrorMessage(action: string, error: unknown): string {
  const err = error as { Code?: string; name?: string; message?: string };
  const code = err.Code || err.name || "Error";
  if (code === "AccessDenied") {
    return `R2 hat ${action} abgelehnt (Access Denied). Das API-Token braucht mindestens «Object Read & Write» auf Bucket «${getR2Bucket()}», und Account-ID plus Bucket-Name müssen zu diesem Token gehören.`;
  }
  return `R2-${action} fehlgeschlagen (${code}).`;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new R2ConfigError(`${name} fehlt. Cloudflare R2 ist nicht konfiguriert.`);
  }
  return value;
}

function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new R2ConfigError(
      "R2_ACCOUNT_ID oder R2_ENDPOINT fehlt. Cloudflare R2 ist nicht konfiguriert.",
    );
  }
  return {
    endpoint,
    bucket: required("R2_BUCKET_NAME"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  };
}

let client: S3Client | undefined;
let corsReady = false;

function getClient(): S3Client {
  if (client) return client;
  const cfg = getConfig();
  client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // AWS SDK v3.729+ signs checksum headers by default; R2 + browser PUTs
    // then fail (often reported as CORS).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

function originFromUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedCorsOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  for (const raw of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
  ]) {
    const origin = originFromUrl(raw);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

/** Idempotent: allow browser PUTs of presigned URLs from the app origin. */
export async function ensureR2Cors(): Promise<void> {
  if (corsReady) return;
  await getClient().send(
    new PutBucketCorsCommand({
      Bucket: getR2Bucket(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedCorsOrigins(),
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: [
              "Content-Type",
              "Content-Length",
              "Content-MD5",
            ],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }),
  );
  corsReady = true;
}

export function getR2Bucket(): string {
  return getConfig().bucket;
}

export async function presignPutUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn,
    signableHeaders: new Set(["content-type"]),
  });
}

/** Short-lived GET URL so the browser can download a DAM original from R2. */
export const R2_DOWNLOAD_EXPIRES_IN = 120;

export async function presignGetUrl(
  key: string,
  opts?: { expiresIn?: number; fileName?: string },
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ...(opts?.fileName
      ? { ResponseContentDisposition: contentDispositionAttachment(opts.fileName) }
      : {}),
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: opts?.expiresIn ?? R2_DOWNLOAD_EXPIRES_IN,
  });
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    throw new R2AccessError(r2ErrorMessage("den Upload", error));
  }
}

export async function getObject(key: string): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const res = await getClient().send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Leeres R2-Objekt: ${key}`);
  }
  return {
    buffer: Buffer.from(bytes),
    contentType: res.ContentType || "application/octet-stream",
  };
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { buffer } = await getObject(key);
  return buffer;
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
      }),
    );
  } catch (error) {
    throw new R2AccessError(r2ErrorMessage("das Löschen", error));
  }
}
