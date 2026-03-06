import { NextRequest, NextResponse } from "next/server";
import { media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { MediaRecord, AuditAction } from "@/types";

interface Params {
  params: Promise<{ id: string }>;
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

  // Optional: caller can pass albumId for efficient Cosmos point-read
  const albumId = request.nextUrl.searchParams.get("albumId");

  try {
    const container = await media();
    let record: MediaRecord | undefined;

    if (albumId) {
      const { resource } = await container.item(id, albumId).read<MediaRecord>();
      record = resource;
    } else {
      // Cross-partition query — less efficient but usable as fallback
      const { resources } = await container.items
        .query<MediaRecord>({
          query: "SELECT * FROM c WHERE c.id = @id AND c.tenantId = @tenantId AND c.isDeleted = false",
          parameters: [
            { name: "@id", value: id },
            { name: "@tenantId", value: tenantId },
          ],
        })
        .fetchAll();
      record = resources[0];
    }

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
