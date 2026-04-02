import { NextRequest, NextResponse } from "next/server";
import { stageBlock, encodeBlockId } from "@/lib/azure/blob";
import { isMediaContributor } from "@/lib/auth/permissions";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

/**
 * PUT /api/admin/upload/chunk
 *
 * Upload a single chunk (block) for a chunked upload session.
 * The chunk is staged in Azure Blob Storage as a block.
 *
 * Query params: uploadId, chunkIndex, blobName
 * Body: raw binary chunk data (application/octet-stream) or FormData with "chunk" file field
 */
async function handlePut(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) {
    logWarn("admin.upload.chunk.PUT.unauthorized", { reason: "Missing session email" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) {
    logWarn("admin.upload.chunk.PUT.forbidden", { email, reason: "No active tenant" });
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) {
    logWarn("admin.upload.chunk.PUT.forbidden", { email, tenantId, reason: "Not a media contributor" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blobName = request.nextUrl.searchParams.get("blobName") ?? "";
  const chunkIndexStr = request.nextUrl.searchParams.get("chunkIndex") ?? "";

  if (!blobName || chunkIndexStr === "") {
    return NextResponse.json(
      { error: "blobName and chunkIndex query params are required" },
      { status: 400 }
    );
  }

  const chunkIndex = parseInt(chunkIndexStr, 10);
  if (isNaN(chunkIndex) || chunkIndex < 0) {
    return NextResponse.json({ error: "Invalid chunkIndex" }, { status: 400 });
  }

  // Read chunk data from request body
  let chunkData: Buffer;
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // FormData-based upload (for browser compatibility)
      const formData = await request.formData();
      const chunkFile = formData.get("chunk");
      if (!(chunkFile instanceof File)) {
        return NextResponse.json({ error: "chunk field is required" }, { status: 400 });
      }
      chunkData = Buffer.from(await chunkFile.arrayBuffer());
    } else {
      // Raw binary body
      const arrayBuffer = await request.arrayBuffer();
      chunkData = Buffer.from(arrayBuffer);
    }
  } catch (err) {
    logError("admin.upload.chunk.PUT.read_failed", { email, blobName, chunkIndex, error: err });
    return NextResponse.json({ error: "Failed to read chunk data" }, { status: 400 });
  }

  if (chunkData.length === 0) {
    return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
  }

  // Stage the block in Azure Blob Storage
  try {
    const blockId = encodeBlockId(chunkIndex);
    await stageBlock("media", blobName, blockId, chunkData);

    return NextResponse.json({
      chunkIndex,
      blockId,
      bytesReceived: chunkData.length,
    });
  } catch (err) {
    logError("admin.upload.chunk.PUT.stage_failed", {
      email, blobName, chunkIndex, error: err,
    });
    return NextResponse.json({ error: "Failed to stage chunk" }, { status: 500 });
  }
}

export const PUT = withRouteLogging("admin.upload.chunk.PUT", handlePut);
