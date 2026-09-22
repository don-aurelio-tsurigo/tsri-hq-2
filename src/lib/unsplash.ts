export function getUnsplashAccessKey(): string | null {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  return key || null;
}

export function unsplashAuthHeaders(accessKey: string): HeadersInit {
  return {
    Authorization: `Client-ID ${accessKey}`,
    "Accept-Version": "v1",
  };
}

/** Required by Unsplash API guidelines on photographer / Unsplash links. */
export const UNSPLASH_UTM = "utm_source=tsri-hub&utm_medium=referral";

export type UnsplashPickerPhoto = {
  id: string;
  thumbUrl: string;
  imageUrl: string;
  altText: string | null;
  photographerName: string;
  photographerUrl: string;
  unsplashUrl: string;
  downloadLocation: string;
};

type UnsplashApiUser = {
  name?: string | null;
  links?: { html?: string | null } | null;
};

type UnsplashApiPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: {
    thumb?: string;
    small?: string;
    regular?: string;
    full?: string;
  } | null;
  links?: {
    html?: string | null;
    download_location?: string | null;
  } | null;
  user?: UnsplashApiUser | null;
};

function withUtm(url: string): string {
  if (!url) return url;
  return url.includes("?") ? `${url}&${UNSPLASH_UTM}` : `${url}?${UNSPLASH_UTM}`;
}

export function mapUnsplashPhoto(photo: UnsplashApiPhoto): UnsplashPickerPhoto | null {
  const id = photo.id?.trim();
  const imageUrl = photo.urls?.regular?.trim() || photo.urls?.full?.trim();
  const thumbUrl =
    photo.urls?.small?.trim() || photo.urls?.thumb?.trim() || imageUrl;
  const downloadLocation = photo.links?.download_location?.trim();
  const photographerName = photo.user?.name?.trim();
  if (!id || !imageUrl || !thumbUrl || !downloadLocation || !photographerName) {
    return null;
  }
  const photographerHtml = photo.user?.links?.html?.trim() || "https://unsplash.com";
  const photoHtml = photo.links?.html?.trim() || `https://unsplash.com/photos/${id}`;
  return {
    id,
    thumbUrl,
    imageUrl,
    altText: photo.alt_description?.trim() || photo.description?.trim() || null,
    photographerName,
    photographerUrl: withUtm(photographerHtml),
    unsplashUrl: withUtm(photoHtml),
    downloadLocation,
  };
}

export function isUnsplashDownloadLocation(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname.toLowerCase() !== "api.unsplash.com") return false;
    return url.pathname.startsWith("/photos/") && url.pathname.includes("/download");
  } catch {
    return false;
  }
}
