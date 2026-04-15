import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { media } from "@/lib/azure/cosmos";
import { commitBlockList, encodeBlockId, uploadBlob } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isMediaContributor } from "@/lib/auth/permissions";
import { buildDefaultMediaTitle, normalizeMediaTags } from "@/lib/media-metadata";
import { MediaRecord, AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError, logInfo } from "@/lib/logging/structured";

const THUMBNAIL_SIZE = 400;

/**
 * POST /api/admin/upload/commit
 *
 * Finalize a chunked upload. Commits all staged blocks into the final blob,
 * generates a placeholder thumbnail, and creates the Cosmos DB media record.
 *
 * Body: { uploadId, blobName, fileName, mimeType, fileType, fileSize, albumId, tags?, totalChunks }
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    logWarn("admin.upload.commit.POST.unauthorized", { reason: "Missing session email" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) {
    logWarn("admin.upload.commit.POST.forbidden", { email, reason: "No active tenant" });
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) {
    logWarn("admin.upload.commit.POST.forbidden", { email, tenantId, reason: "Not a media contributor" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: {
    uploadId: string;
    blobName: string;
    fileName: string;
    mimeType: string;
    fileType: "image" | "video";
    fileSize: number;
    albumId: string;
    tags?: string;
    totalChunks: number;
    /** Base64-encoded WebP thumbnail extracted in the browser. Optional. */
    thumbnailBase64?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    uploadId,
    blobName,
    fileName,
    mimeType,
    fileType,
    fileSize,
    albumId,
    tags: tagsRaw,
    totalChunks,
    thumbnailBase64,
  } = body;

  if (!uploadId || !blobName || !fileName || !mimeType || !fileType || !albumId || !totalChunks) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Security: ensure the blob name is scoped to the caller's tenant
  if (!blobName.startsWith(`${tenantId}/`)) {
    logWarn("admin.upload.commit.POST.blob_scope_violation", {
      email, tenantId, blobName,
      hint: "blobName does not match the caller's tenant prefix",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build ordered block ID list
  const blockIds: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    blockIds.push(encodeBlockId(i));
  }

  try {
    // Commit all staged blocks into the final blob
    await commitBlockList("media", blobName, blockIds, mimeType);

    logInfo("admin.upload.commit.POST.blocks_committed", {
      email, uploadId, blobName, totalChunks,
    });

    // Generate and upload the thumbnail.
    // - For videos: the client supplies a base64-encoded frame so the
    //   gallery shows a real preview. We re-encode it through sharp to
    //   guarantee a valid, size-clamped WebP.
    // - For images: we don't have the full file in memory at commit time
    //   (chunked upload streams it straight to blob), so fall back to a
    //   colored placeholder.
    // - On any failure, fall back to the dark placeholder rather than
    //   blocking the upload.
    const thumbnailBlobName = blobName.replace(/\.[^/.]+$/, "_thumb.webp");
    let thumbnailBuffer: Buffer | null = null;

    if (thumbnailBase64 && fileType === "video") {
      try {
        const clientBuffer = Buffer.from(thumbnailBase64, "base64");
        thumbnailBuffer = await sharp(clientBuffer)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: "cover",
            position: "centre",
          })
          .webp({ quality: 80 })
          .toBuffer();
      } catch (err) {
        logWarn("admin.upload.commit.POST.client_thumbnail_invalid", {
          email,
          uploadId,
          fileName,
          error: (err as Error)?.message,
        });
        thumbnailBuffer = null;
      }
    }

    if (!thumbnailBuffer) {
      thumbnailBuffer = await sharp({
        create: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          channels: 3,
          background:
            fileType === "video"
              ? { r: 30, g: 30, b: 30 }
              : { r: 60, g: 60, b: 80 },
        },
      })
        .webp()
        .toBuffer();
    }

    await uploadBlob("thumbnails", thumbnailBlobName, thumbnailBuffer, "image/webp");

    // Create Cosmos DB media record
    const tags = normalizeMediaTags(tagsRaw ?? "");
    const now = new Date().toISOString();
    const record: MediaRecord = {
      id: uploadId,
      albumId,
      tenantId,
      fileName,
      title: buildDefaultMediaTitle(fileName),
      fileType,
      mimeType,
      sizeBytes: fileSize,
      blobName,
      thumbnailBlobName,
      tags,
      uploadedAt: now,
      uploadedBy: email,
      isDeleted: false,
    };

    const container = await media();
    await container.items.create(record);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.MEDIA_UPLOADED,
      detail: {
        mediaId: uploadId,
        albumId,
        fileName,
        fileType,
        sizeBytes: fileSize,
        chunked: true,
        totalChunks,
      },
    });

    logInfo("admin.upload.commit.POST.success", {
      email, uploadId, fileName, fileSize, totalChunks,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logError("admin.upload.commit.POST.error", {
      email, tenantId, albumId, uploadId, fileName, error: err,
    });
    return NextResponse.json({ error: "Failed to commit upload" }, { status: 500 });
  }
}

export const POST = withRouteLogging("admin.upload.commit.POST", handlePost);
