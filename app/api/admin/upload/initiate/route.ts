import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { albums } from "@/lib/azure/cosmos";
import { isMediaContributor } from "@/lib/auth/permissions";
import { resolveUploadedMediaType } from "@/lib/media-upload";
import { withRouteLogging, logWarn } from "@/lib/logging/structured";

/**
 * POST /api/admin/upload/initiate
 *
 * Begin a chunked upload session. Returns an uploadId, blobName, and
 * pre-computed block IDs the client should use for each chunk.
 *
 * Body: { fileName, mimeType, fileSize, albumId, tags?, totalChunks }
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    logWarn("admin.upload.initiate.POST.unauthorized", { reason: "Missing session email" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) {
    logWarn("admin.upload.initiate.POST.forbidden", { email, reason: "No active tenant" });
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) {
    logWarn("admin.upload.initiate.POST.forbidden", { email, tenantId, reason: "Not a media contributor" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    fileName: string;
    mimeType: string;
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

  const { fileName, mimeType, fileSize, albumId, totalChunks } = body;

  if (!fileName || !mimeType || !fileSize || !albumId || !totalChunks) {
    return NextResponse.json(
      { error: "fileName, mimeType, fileSize, albumId, and totalChunks are required" },
      { status: 400 }
    );
  }

  if (totalChunks > 50000) {
    return NextResponse.json(
      { error: "Too many chunks. Maximum 50,000 blocks per blob." },
      { status: 400 }
    );
  }

  // Validate media type
  const mediaType = resolveUploadedMediaType({ name: fileName, type: mimeType });
  if (!mediaType) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload an approved image or a common video format such as MP4, MOV, AVI, WEBM, M4V, MPEG, or WMV.",
      },
      { status: 415 }
    );
  }

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
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const blobName = `${tenantId}/${albumId}/${mediaId}.${ext}`;

  return NextResponse.json({
    uploadId: mediaId,
    blobName,
    fileType: mediaType.fileType,
    mimeType: mediaType.mimeType,
    totalChunks,
  });
}

export const POST = withRouteLogging("admin.upload.initiate.POST", handlePost);
