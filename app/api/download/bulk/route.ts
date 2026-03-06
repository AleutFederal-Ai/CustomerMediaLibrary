import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { Readable, PassThrough } from "stream";
import { media } from "@/lib/azure/cosmos";
import { getBlobClient } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { MediaRecord, AuditAction } from "@/types";

/**
 * POST /api/download/bulk
 * Body: { mediaIds: string[], albumId: string }
 * Streams a ZIP of the requested files directly from blob storage.
 * Never exposes blob URLs to the client.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  let body: { mediaIds?: string[]; albumId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { mediaIds, albumId } = body;

  if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
    return NextResponse.json(
      { error: "mediaIds must be a non-empty array" },
      { status: 400 }
    );
  }

  if (mediaIds.length > 200) {
    return NextResponse.json(
      { error: "Maximum 200 files per bulk download" },
      { status: 400 }
    );
  }

  if (!albumId) {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 });
  }

  try {
    const container = await media();

    // Fetch all requested media records
    const rawRecords = await Promise.all(
      mediaIds.map(async (id) => {
        const { resource } = await container.item(id, albumId).read<MediaRecord>();
        return resource as MediaRecord | undefined;
      })
    );

    const validRecords: MediaRecord[] = rawRecords.filter(
      (r): r is MediaRecord => r !== undefined && !r.isDeleted && r.tenantId === tenantId
    );

    if (validRecords.length === 0) {
      return NextResponse.json(
        { error: "No valid media found" },
        { status: 404 }
      );
    }

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.BULK_DOWNLOAD,
      detail: {
        albumId,
        requestedCount: mediaIds.length,
        servedCount: validRecords.length,
        mediaIds: validRecords.map((r) => r.id),
      },
    });

    // Build a streaming ZIP response
    const passThrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 1 } });

    archive.on("error", (err) => {
      console.error("[bulk-download] archiver error:", err);
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    // Append all blobs to the archive asynchronously
    (async () => {
      for (const record of validRecords) {
        const blobClient = await getBlobClient("media", record.blobName);
        const downloadResponse = await blobClient.download();
        if (downloadResponse.readableStreamBody) {
          // Convert browser ReadableStream to Node.js Readable for archiver
          const nodeStream = Readable.from(
            downloadResponse.readableStreamBody as AsyncIterable<Uint8Array>
          );
          archive.append(nodeStream, { name: record.fileName });
        }
      }
      await archive.finalize();
    })().catch((err) => {
      console.error("[bulk-download] stream error:", err);
      passThrough.destroy(err);
    });

    // Convert Node.js PassThrough to Web ReadableStream for NextResponse
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        passThrough.on("data", (chunk: Buffer) =>
          controller.enqueue(new Uint8Array(chunk))
        );
        passThrough.on("end", () => controller.close());
        passThrough.on("error", (err) => controller.error(err));
      },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `media-${timestamp}.zip`;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("[bulk-download] POST error:", err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
