import { NextRequest, NextResponse } from "next/server";
import { media } from "@/lib/azure/cosmos";
import { getBlobClient } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { MediaRecord, AuditAction } from "@/types";

/**
 * GET /api/media/download?id=<mediaId>&albumId=<albumId>
 * Server-side single file download — never exposes blob URL to client.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";

  const id = request.nextUrl.searchParams.get("id");
  const albumId = request.nextUrl.searchParams.get("albumId");

  if (!id || !albumId) {
    return NextResponse.json(
      { error: "id and albumId are required" },
      { status: 400 }
    );
  }

  try {
    const container = await media();
    const { resource: record } = await container
      .item(id, id)
      .read<MediaRecord>();

    if (!record || record.isDeleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const blobClient = await getBlobClient("media", record.blobName);
    const downloadResponse = await blobClient.download();

    if (!downloadResponse.readableStreamBody) {
      return NextResponse.json(
        { error: "Unable to stream file" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.MEDIA_DOWNLOADED,
      detail: { mediaId: id, albumId, fileName: record.fileName },
    });

    // Stream the blob directly to the client
    const stream = downloadResponse.readableStreamBody as NodeJS.ReadableStream;
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        stream.on("end", () => controller.close());
        stream.on("error", (err) => controller.error(err));
      },
    });

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(record.fileName)}"`,
        "Cache-Control": "no-store",
        ...(downloadResponse.contentLength
          ? { "Content-Length": String(downloadResponse.contentLength) }
          : {}),
      },
    });
  } catch (err) {
    console.error("[media/download] GET error:", err);
    return NextResponse.json(
      { error: "Download failed" },
      { status: 500 }
    );
  }
}
