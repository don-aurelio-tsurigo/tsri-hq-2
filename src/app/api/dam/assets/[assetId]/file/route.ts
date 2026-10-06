import { NextResponse } from "next/server";
import { looksLikeHeicBytes, sniffImageContentType } from "@/lib/dam/accept";
import { renderDamPreviewWebp, renderPublishedMaster } from "@/lib/dam/apply-edits";
import {
  baseDerivativeKey,
  isDefaultEditParams,
  previewDerivativeKey,
  writeEditedDerivatives,
} from "@/lib/dam/derivatives";
import {
  contentDispositionAttachment,
  derivativeKey,
  replaceKeyExtension,
} from "@/lib/dam/filename";
import {
  DEFAULT_EDIT_PARAMS,
  editParamsRev,
  parseEditParams,
} from "@/lib/dam/edit-params";
import { jpegBufferFromHeic } from "@/lib/dam/heic";
import { prisma } from "@/lib/db";
import { getObject, putObject } from "@/lib/r2";
import { getActiveMembershipContext } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

function imageResponse(
  buffer: Buffer,
  contentType: string,
  extraHeaders?: Record<string, string>,
) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=120",
      ...extraHeaders,
    },
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ assetId: string }> },
) {
  const auth = await getActiveMembershipContext();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { assetId } = await ctx.params;
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") ?? "thumb";
  const clientRev = url.searchParams.get("r");
  /** Editor canvas + face crops: orientation-baked, no stored edit recipe. */
  const baseOnly = url.searchParams.get("base") === "1";
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      OR: [
        { uploadedBy: auth.session.user.id, status: { in: ["staging", "rejected"] } },
        { status: { in: ["published", "archived"] } },
      ],
    },
    select: {
      r2Key: true,
      fileName: true,
      editParams: true,
      credit: true,
      altText: true,
      keywords: true,
      notes: true,
      rightsType: true,
      takenAt: true,
    },
  });
  if (!asset) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    if (baseOnly && (variant === "thumb" || variant === "web")) {
      const baseKey = baseDerivativeKey(asset.r2Key, variant);
      try {
        const cached = await getObject(baseKey);
        return imageResponse(cached.buffer, "image/webp", {
          "Cache-Control": "private, max-age=86400",
        });
      } catch {
        /* render below — never fall back to the classic key, it may hold
           the edited (cropped) render */
      }
      const original = await getObject(asset.r2Key);
      const buffer = await renderDamPreviewWebp(
        original.buffer,
        DEFAULT_EDIT_PARAMS,
        variant === "thumb" ? 480 : 2000,
        variant === "thumb" ? 72 : 80,
      );
      try {
        await putObject(baseKey, buffer, "image/webp");
      } catch (error) {
        console.warn("[dam] base derivative write failed", error);
      }
      return imageResponse(buffer, "image/webp", {
        "Cache-Control": "private, max-age=86400",
      });
    }

    if (variant === "thumb" || variant === "web") {
      const params = parseEditParams(asset.editParams);
      const serverRev = editParamsRev(params);
      // Avoid poisoning the browser cache when the client optimistic `r=` is ahead
      // of the DB write, or points at a stale recipe.
      const cacheControl =
        clientRev && clientRev !== serverRev
          ? "private, no-store"
          : "private, max-age=86400";

      const recipeKey = previewDerivativeKey(asset.r2Key, variant, params);
      try {
        const cached = await getObject(recipeKey);
        return imageResponse(cached.buffer, "image/webp", {
          "Cache-Control": cacheControl,
        });
      } catch {
        /* try classic only when the recipe is default — otherwise it is often
           an unedited upload thumb and would hide straighten/colour edits. */
      }

      if (isDefaultEditParams(params)) {
        try {
          const classic = await getObject(derivativeKey(asset.r2Key, variant));
          return imageResponse(classic.buffer, "image/webp", {
            "Cache-Control": cacheControl,
          });
        } catch {
          /* regenerate below */
        }
      }

      const original = await getObject(asset.r2Key);
      const buffer = await renderDamPreviewWebp(
        original.buffer,
        params,
        variant === "thumb" ? 480 : 2000,
        variant === "thumb" ? 72 : 80,
      );
      try {
        await writeEditedDerivatives(asset.r2Key, original.buffer, params);
      } catch (error) {
        console.warn("[dam] derivative backfill failed", error);
      }
      return imageResponse(buffer, "image/webp", {
        "Cache-Control": cacheControl,
      });
    }

    const original = await getObject(asset.r2Key);
    if (variant === "original") {
      const rendered = await renderPublishedMaster(
        original.buffer,
        asset.editParams,
        {
          credit: asset.credit,
          altText: asset.altText,
          keywords: asset.keywords,
          notes: asset.notes,
          rightsType: asset.rightsType,
          takenAt: asset.takenAt,
        },
        { preserveFormat: true },
      );
      return imageResponse(rendered.buffer, rendered.contentType, {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDispositionAttachment(
          replaceKeyExtension(asset.fileName, rendered.extension),
        ),
      });
    }

    if (variant === "export") {
      const rendered = await renderPublishedMaster(original.buffer, asset.editParams, {
        credit: asset.credit,
        altText: asset.altText,
        keywords: asset.keywords,
        notes: asset.notes,
        rightsType: asset.rightsType,
        takenAt: asset.takenAt,
      });
      return imageResponse(rendered.buffer, rendered.contentType, {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDispositionAttachment(
          replaceKeyExtension(asset.fileName, rendered.extension),
        ),
      });
    }

    let { buffer, contentType } = original;
    if (looksLikeHeicBytes(buffer)) {
      try {
        buffer = await jpegBufferFromHeic(buffer, 4000);
        contentType = "image/jpeg";
      } catch (error) {
        console.warn("[dam] HEIC preview convert failed", error);
        contentType = "image/heic";
      }
    } else {
      contentType = sniffImageContentType(buffer) ?? contentType;
    }
    return imageResponse(buffer, contentType);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
