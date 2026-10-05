/**
 * Checks AWS Rekognition access for DAM face recognition and creates the
 * collection if it does not exist yet.
 *
 *   npm run dam:face-check
 */

import {
  CreateCollectionCommand,
  DescribeCollectionCommand,
  RekognitionClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-rekognition";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} fehlt in .env`);
  return value;
}

async function main() {
  const region = required("REKOGNITION_REGION");
  const collectionId = required("REKOGNITION_COLLECTION_ID");
  const client = new RekognitionClient({
    region,
    credentials: {
      accessKeyId: required("REKOGNITION_ACCESS_KEY_ID"),
      secretAccessKey: required("REKOGNITION_SECRET_ACCESS_KEY"),
    },
  });

  try {
    const existing = await client.send(
      new DescribeCollectionCommand({ CollectionId: collectionId }),
    );
    console.log(
      `[dam-face] Collection «${collectionId}» existiert (${region}): ${existing.FaceCount ?? 0} Gesichter, ${existing.UserCount ?? 0} Personen, Modell ${existing.FaceModelVersion}`,
    );
    return;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }

  const created = await client.send(
    new CreateCollectionCommand({ CollectionId: collectionId }),
  );
  console.log(
    `[dam-face] Collection «${collectionId}» angelegt (${region}), Modell ${created.FaceModelVersion}`,
  );
}

main().catch((error) => {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[dam-face] ${name}: ${message}`);
  process.exit(1);
});
