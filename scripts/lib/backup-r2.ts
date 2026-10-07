/** R2-Client für den Backup-Bucket (db-backup, db-restore-check). */

import { S3Client } from "@aws-sdk/client-s3";

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt.`);
  return value;
}

export function backupR2(): { client: S3Client; bucket: string } {
  const accountId = required("BACKUP_R2_ACCOUNT_ID");
  const bucket = required("BACKUP_R2_BUCKET_NAME");

  // EU-Jurisdiction-Buckets brauchen https://<account>.eu.r2.cloudflarestorage.com.
  // Cloudflare zeigt die S3-URL inkl. Bucket-Namen an – den Pfad hier abschneiden,
  // sonst landen Uploads unter <bucket>/<key> und List-Aufrufe schlagen fehl.
  const configured = process.env.BACKUP_R2_ENDPOINT?.trim();
  const endpoint = configured
    ? new URL(configured).origin
    : `https://${accountId}.r2.cloudflarestorage.com`;

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: required("BACKUP_R2_ACCESS_KEY_ID"),
      secretAccessKey: required("BACKUP_R2_SECRET_ACCESS_KEY"),
    },
  });
  return { client, bucket };
}
