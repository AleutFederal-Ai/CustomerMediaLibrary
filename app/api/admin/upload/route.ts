import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { media, albums } from "@/lib/azure/cosmos";
import { uploadBlob } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isMediaContributor } from "@/lib/auth/permissions";
import { resolveUploadedMediaType } from "@/lib/media-upload";
import { buildDefaultMediaTitle, normalizeMediaTags } from "@/lib/media-metadata";
import { MediaRecord, AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

const THUMBNAIL_SIZE = 400;

/**
 * POST /api/admin/upload
 * multipart/form-data: { file: File, albumId: string, tags?: string (comma-separated) }
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    logWarn("admin.upload.POST.unauthorized", { reason: "Missing session email" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) {
    logWarn("admin.upload.POST.forbidden", { email, reason: "No active tenant" });
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) {
    logWarn("admin.upload.POST.forbidden", { email, tenantId, reason: "Not a media contributor" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logWarn("admin.upload.POST.form_parse_failed", { email, error });
    return NextResponse.json(
      {
        error:
          "Upload payload could not be read. Please retry the upload. Very large files are uploaded in chunks automatically — if this persists, try refreshing the page.",
      },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const albumId = (formData.get("albumId") as string | null)?.trim();
  const tagsRaw = (formData.get("tags") as string | null) ?? "";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!albumId) {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 });
  }

  const mediaType = resolveUploadedMediaType(file);

  if (!mediaType) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload an approved image or a common video format such as MP4, MOV, AVI, WEBM, M4V, MPEG, or WMV.",
      },
      { status: 415 }
    );
  }

  const { fileType, mimeType } = mediaType;
  const isImage = fileType === "image";

  // Verify album exists and belongs to this tenant
  try {
    const albumsContainer = await albums();
    const { resource: album } = await albumsContainer.item(albumId, albumId).read();
    if (!album || album.isDeleted || album.tenantId !== tenantId) {
      return NextResponse.json({ error: "Album not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const mediaId = uuidv4();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const blobName = `${tenantId}/${albumId}/${mediaId}.${ext}`;
  const thumbnailBlobName = `${tenantId}/${albumId}/${mediaId}_thumb.webp`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload original
    await uploadBlob("media", blobName, buffer, mimeType);

    // Generate and upload thumbnail
    let thumbnailBuffer: Buffer;
    if (isImage) {
      thumbnailBuffer = await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      // For video, use a placeholder thumbnail (grey square)
      // Full video thumbnail generation would require ffmpeg
      thumbnailBuffer = await sharp({
        create: {
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          channels: 3,
          background: { r: 30, g: 30, b: 30 },
        },
      })
        .webp()
        .toBuffer();
    }

    await uploadBlob("thumbnails", thumbnailBlobName, thumbnailBuffer, "image/webp");

    const tags = normalizeMediaTags(tagsRaw);

    const now = new Date().toISOString();
    const record: MediaRecord = {
      id: mediaId,
      albumId,
      tenantId,
      fileName: file.name,
      title: buildDefaultMediaTitle(file.name),
      fileType,
      mimeType,
      sizeBytes: buffer.length,
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
        mediaId,
        albumId,
        fileName: file.name,
        fileType: record.fileType,
        sizeBytes: buffer.length,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logError("admin.upload.POST.error", { email, tenantId, albumId, fileName: file.name, error: err });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export const POST = withRouteLogging("admin.upload.POST", handlePost);
