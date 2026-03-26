import { NextRequest, NextResponse } from "next/server";
import { media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isMediaContributor, isTenantAdmin } from "@/lib/auth/permissions";
import { buildDefaultMediaTitle, normalizeMediaTags } from "@/lib/media-metadata";
import { MediaRecord, AuditAction } from "@/types";

interface Params {
  params: Promise<{ id: string }>;
}

interface MediaMetadataPatchBody {
  title?: string;
  description?: string;
  tags?: string[] | string;
}

export async function GET(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params;
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const container = await media();

    // Point-read by id (partition key is /id)
    const { resource: record } = await container.item(id, id).read<MediaRecord>();

    if (!record || record.isDeleted || record.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Generate 15-minute SAS URLs for both full res and thumbnail
    const [fullRes, thumb] = await Promise.all([
      generateSasUrl("media", record.blobName),
      generateSasUrl("thumbnails", record.thumbnailBlobName),
    ]);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.MEDIA_VIEWED,
      detail: { mediaId: id, albumId: record.albumId, fileName: record.fileName },
    });

    return NextResponse.json({
      id: record.id,
      albumId: record.albumId,
      fileName: record.fileName,
      title: record.title ?? buildDefaultMediaTitle(record.fileName),
      description: record.description,
      fileType: record.fileType,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      tags: record.tags,
      sasUrl: fullRes.sasUrl,
      thumbnailUrl: thumb.sasUrl,
      expiresAt: fullRes.expiresAt,
    });
  } catch (err) {
    console.error("[media/id] GET error:", err);
    return NextResponse.json({ error: "Failed to load media" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params;
  const email = request.headers.get("x-session-email");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = request.headers.get("x-active-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  const isAdmin = await isTenantAdmin(email, tenantId);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: MediaMetadataPatchBody;
  try {
    body = (await request.json()) as MediaMetadataPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const normalizedTitle =
    body.title === undefined ? undefined : body.title.trim();
  const normalizedDescription =
    body.description === undefined ? undefined : body.description.trim();
  const normalizedTags =
    body.tags === undefined ? undefined : normalizeMediaTags(body.tags);

  if (normalizedTitle !== undefined && normalizedTitle.length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const container = await media();
    const { resource: record } = await container.item(id, id).read<MediaRecord>();

    if (!record || record.isDeleted || record.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextTitle = normalizedTitle ?? record.title ?? buildDefaultMediaTitle(record.fileName);
    const nextDescription =
      normalizedDescription !== undefined
        ? normalizedDescription || undefined
        : record.description;
    const nextTags = normalizedTags ?? record.tags;
    const titlePatchOp: "add" | "replace" =
      record.title === undefined ? "add" : "replace";
    const descriptionPatchOp: "add" | "replace" =
      record.description === undefined ? "add" : "replace";
    const tagsPatchOp: "add" | "replace" =
      record.tags === undefined ? "add" : "replace";
    const patchOperations = [
      {
        op: titlePatchOp,
        path: "/title",
        value: nextTitle,
      },
      ...(nextDescription === undefined
        ? record.description === undefined
          ? []
          : [{ op: "remove" as const, path: "/description" }]
        : [
            {
              op: descriptionPatchOp,
              path: "/description",
              value: nextDescription,
            },
          ]),
      {
        op: tagsPatchOp,
        path: "/tags",
        value: nextTags,
      },
    ];

    await container.item(id, id).patch(patchOperations);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.MEDIA_UPDATED,
      detail: {
        mediaId: id,
        albumId: record.albumId,
        title: nextTitle,
        tags: nextTags,
      },
    });

    return NextResponse.json({
      id: record.id,
      albumId: record.albumId,
      fileName: record.fileName,
      title: nextTitle,
      description: nextDescription,
      fileType: record.fileType,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      tags: nextTags,
    });
  } catch (err) {
    console.error("[media/id] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update media" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const { id } = await params;
  const email = request.headers.get("x-session-email");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = request.headers.get("x-active-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const container = await media();

    // Point-read by id (partition key is /id)
    const { resource: record } = await container.item(id, id).read<MediaRecord>();

    if (!record || record.isDeleted || record.tenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    await container.item(id, id).patch([
      { op: "replace", path: "/isDeleted", value: true },
      { op: "add", path: "/deletedAt", value: now },
      { op: "add", path: "/deletedBy", value: email },
    ]);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.MEDIA_DELETED,
      detail: { mediaId: id, albumId: record.albumId, fileName: record.fileName },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[media/id] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
  }
}
