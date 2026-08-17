import {
  getWepublishAdminGraphqlUrl,
  getWepublishApiToken,
  WepublishApiError,
} from "@/lib/wepublish/client";

const UPLOAD_MUTATION = `mutation UploadImage($file: Upload!, $title: String, $description: String, $source: String, $focalPointX: Float!, $focalPointY: Float!) {
  uploadImage(file: $file, tags: [], title: $title, description: $description, source: $source, focalPointX: $focalPointX, focalPointY: $focalPointY) {
    id url title
  }
}`;

export type WepublishImageMeta = {
  fileName: string;
  altText: string | null;
  credit: string;
};

export type WepublishUploadedImage = {
  id: string;
  url: string;
  title: string;
};

export function wepublishUploadVariables(meta: WepublishImageMeta) {
  return {
    file: null,
    title: meta.fileName,
    description: meta.altText?.trim() || meta.fileName,
    source: meta.credit,
    focalPointX: 0.5,
    focalPointY: 0.5,
  };
}

export async function uploadImageToWepublish(
  file: { buffer: Buffer; contentType: string; fileName: string },
  meta: WepublishImageMeta,
): Promise<WepublishUploadedImage> {
  const token = getWepublishApiToken();
  const form = new FormData();
  form.set(
    "operations",
    JSON.stringify({
      query: UPLOAD_MUTATION,
      variables: wepublishUploadVariables(meta),
    }),
  );
  form.set("map", JSON.stringify({ "0": ["variables.file"] }));
  form.set(
    "0",
    new Blob([new Uint8Array(file.buffer)], {
      type: file.contentType || "image/jpeg",
    }),
    file.fileName,
  );

  let response: Response;
  try {
    response = await fetch(getWepublishAdminGraphqlUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new WepublishApiError(
      "we.publish API ist nicht erreichbar. Bitte später erneut versuchen.",
    );
  }

  const raw = await response.text();
  let payload: {
    data?: { uploadImage?: WepublishUploadedImage | null };
    errors?: { message: string }[];
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new WepublishApiError(
      response.ok
        ? "Ungültige Antwort von we.publish."
        : `we.publish API antwortete mit HTTP ${response.status}.`,
    );
  }

  if (!response.ok) {
    throw new WepublishApiError(
      payload.errors?.map((error) => error.message).join("; ") ||
        `we.publish API antwortete mit HTTP ${response.status}.`,
    );
  }
  if (payload.errors?.length) {
    throw new WepublishApiError(
      payload.errors.map((error) => error.message).join("; ") ||
        "GraphQL-Fehler von we.publish.",
    );
  }

  const image = payload.data?.uploadImage;
  if (!image?.id || !image.url) {
    throw new WepublishApiError("we.publish hat kein Bild zurückgegeben.");
  }
  return { id: image.id, url: image.url, title: image.title };
}
