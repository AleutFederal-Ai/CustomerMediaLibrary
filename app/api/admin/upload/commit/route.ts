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

    // Generate and upload a placeholder thumbnail
    // For video files we generate a dark placeholder; for images we also
    // use a placeholder since we don't have the full image in memory
    // (the original approach of reading the whole file into memory for
    // sharp is exactly what we're avoiding with chunked upload).
    const thumbnailBlobName = blobName.replace(/\.[^/.]+$/, "_thumb.webp");
    const thumbnailBuffer = await sharp({
      create: {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        channels: 3,
        background: fileType === "video"
          ? { r: 30, g: 30, b: 30 }
          : { r: 60, g: 60, b: 80 },
      },
    })
      .webp()
      .toBuffer();

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
