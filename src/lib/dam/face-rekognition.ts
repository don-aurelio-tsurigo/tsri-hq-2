import {
  AssociateFacesCommand,
  ConflictException,
  CreateUserCommand,
  DeleteFacesCommand,
  DeleteUserCommand,
  DisassociateFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  ResourceNotFoundException,
  SearchFacesCommand,
  SearchUsersCommand,
} from "@aws-sdk/client-rekognition";

export type FaceBox = { left: number; top: number; width: number; height: number };

export type IndexedFace = {
  faceId: string;
  box: FaceBox;
  confidence: number;
  sharpness: number | null;
};

export type FaceSettings = {
  autoMatchSimilarity: number;
  suggestSimilarity: number;
  minBoxSize: number;
  maxPerImage: number;
  batchSize: number;
};

const globalForRekognition = globalThis as unknown as {
  __damRekognitionClient?: RekognitionClient;
};

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function faceSettings(): FaceSettings {
  return {
    autoMatchSimilarity: envNumber("FACE_AUTO_MATCH_SIMILARITY", 97, 50, 100),
    suggestSimilarity: envNumber("FACE_SUGGEST_SIMILARITY", 85, 50, 100),
    minBoxSize: envNumber("FACE_MIN_BOX_SIZE", 0.05, 0, 1),
    maxPerImage: Math.round(envNumber("FACE_MAX_PER_IMAGE", 15, 1, 100)),
    batchSize: Math.round(envNumber("FACE_BATCH_SIZE", 3, 1, 20)),
  };
}

/** Credentials present — enough to delete faces even while scanning is switched off. */
export function rekognitionConfigured(): boolean {
  return Boolean(
    process.env.REKOGNITION_REGION?.trim() &&
      process.env.REKOGNITION_ACCESS_KEY_ID?.trim() &&
      process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim() &&
      process.env.REKOGNITION_COLLECTION_ID?.trim(),
  );
}

export function faceRecognitionEnabled(): boolean {
  return process.env.FACE_RECOGNITION_ENABLED?.trim() === "true" && rekognitionConfigured();
}

function collectionId(): string {
  const id = process.env.REKOGNITION_COLLECTION_ID?.trim();
  if (!id) throw new Error("REKOGNITION_COLLECTION_ID fehlt.");
  return id;
}

function getClient(): RekognitionClient {
  if (globalForRekognition.__damRekognitionClient) {
    return globalForRekognition.__damRekognitionClient;
  }
  if (!rekognitionConfigured()) {
    throw new Error("AWS Rekognition ist nicht konfiguriert (REKOGNITION_*).");
  }
  const client = new RekognitionClient({
    region: process.env.REKOGNITION_REGION!.trim(),
    credentials: {
      accessKeyId: process.env.REKOGNITION_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.REKOGNITION_SECRET_ACCESS_KEY!.trim(),
    },
    maxAttempts: 6,
  });
  globalForRekognition.__damRekognitionClient = client;
  return client;
}

function toBox(box: { Left?: number; Top?: number; Width?: number; Height?: number }): FaceBox {
  const clamp = (value: number | undefined) => Math.min(1, Math.max(0, value ?? 0));
  return {
    left: clamp(box.Left),
    top: clamp(box.Top),
    width: clamp(box.Width),
    height: clamp(box.Height),
  };
}

/** Indexes up to `maxFaces` (largest first) and returns them with bounding boxes. */
export async function indexFaces(
  jpeg: Buffer,
  externalImageId: string,
  maxFaces: number,
): Promise<IndexedFace[]> {
  const res = await getClient().send(
    new IndexFacesCommand({
      CollectionId: collectionId(),
      Image: { Bytes: jpeg },
      ExternalImageId: externalImageId,
      DetectionAttributes: ["DEFAULT"],
      MaxFaces: maxFaces,
      QualityFilter: "AUTO",
    }),
  );
  return (res.FaceRecords ?? []).flatMap((record) => {
    const faceId = record.Face?.FaceId;
    if (!faceId || !record.Face?.BoundingBox) return [];
    return [
      {
        faceId,
        box: toBox(record.Face.BoundingBox),
        confidence: record.Face.Confidence ?? 0,
        sharpness: record.FaceDetail?.Quality?.Sharpness ?? null,
      },
    ];
  });
}

export async function deleteFaces(faceIds: string[]): Promise<void> {
  for (let i = 0; i < faceIds.length; i += 4096) {
    const chunk = faceIds.slice(i, i + 4096);
    if (chunk.length === 0) continue;
    await getClient().send(
      new DeleteFacesCommand({ CollectionId: collectionId(), FaceIds: chunk }),
    );
  }
}

/** Best person (Rekognition user) matches for an indexed face, highest first. */
export async function searchUsersByFace(
  faceId: string,
  minSimilarity: number,
): Promise<{ userId: string; similarity: number }[]> {
  const res = await getClient().send(
    new SearchUsersCommand({
      CollectionId: collectionId(),
      FaceId: faceId,
      UserMatchThreshold: minSimilarity,
      MaxUsers: 5,
    }),
  );
  return (res.UserMatches ?? [])
    .flatMap((match) =>
      match.User?.UserId && match.Similarity !== undefined
        ? [{ userId: match.User.UserId, similarity: match.Similarity }]
        : [],
    )
    .sort((a, b) => b.similarity - a.similarity);
}

/** Similar faces in the whole collection (used after naming a face). */
export async function searchFacesByFace(
  faceId: string,
  minSimilarity: number,
): Promise<{ faceId: string; similarity: number }[]> {
  const res = await getClient().send(
    new SearchFacesCommand({
      CollectionId: collectionId(),
      FaceId: faceId,
      FaceMatchThreshold: minSimilarity,
      MaxFaces: 4096,
    }),
  );
  return (res.FaceMatches ?? []).flatMap((match) =>
    match.Face?.FaceId && match.Similarity !== undefined
      ? [{ faceId: match.Face.FaceId, similarity: match.Similarity }]
      : [],
  );
}

/** Creates the Rekognition user for a person; no-op if it already exists. */
export async function ensurePersonUser(userId: string): Promise<void> {
  try {
    await getClient().send(
      new CreateUserCommand({ CollectionId: collectionId(), UserId: userId }),
    );
  } catch (error) {
    if (error instanceof ConflictException) return;
    throw error;
  }
}

export async function deletePersonUser(userId: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteUserCommand({ CollectionId: collectionId(), UserId: userId }),
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return;
    throw error;
  }
}

/**
 * Adds manually confirmed faces as references for a person. A low threshold:
 * the editor already confirmed the match; this only guards against obvious mix-ups.
 */
export async function associateFacesToUser(
  userId: string,
  faceIds: string[],
): Promise<{ associated: string[]; failed: string[] }> {
  if (faceIds.length === 0) return { associated: [], failed: [] };
  const res = await getClient().send(
    new AssociateFacesCommand({
      CollectionId: collectionId(),
      UserId: userId,
      FaceIds: faceIds.slice(0, 100),
      UserMatchThreshold: 50,
    }),
  );
  return {
    associated: (res.AssociatedFaces ?? []).flatMap((face) => (face.FaceId ? [face.FaceId] : [])),
    failed: (res.UnsuccessfulFaceAssociations ?? []).flatMap((face) =>
      face.FaceId ? [face.FaceId] : [],
    ),
  };
}

export async function disassociateFacesFromUser(
  userId: string,
  faceIds: string[],
): Promise<void> {
  if (faceIds.length === 0) return;
  await getClient().send(
    new DisassociateFacesCommand({
      CollectionId: collectionId(),
      UserId: userId,
      FaceIds: faceIds.slice(0, 100),
    }),
  );
}
