import { NextRequest, NextResponse } from "next/server";
import { albums, media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { AlbumRecord, MediaRecord, AuditAction, AlbumListItem } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const albumsContainer = await albums();
    const { resources: albumList } = await albumsContainer.items
      .query<AlbumRecord>({
        query:
          "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c.order ASC",
        parameters: [{ name: "@tenantId", value: tenantId }],
      })
      .fetchAll();

    const mediaContainer = await media();

    // Build response with media counts and cover thumbnail SAS URLs
    const items: AlbumListItem[] = await Promise.all(
      albumList.map(async (album) => {
        // Count non-deleted media in this album
        const { resources: counts } = await mediaContainer.items
          .query<number>({
            query:
              "SELECT VALUE COUNT(1) FROM c WHERE c.albumId = @albumId AND c.tenantId = @tenantId AND c.isDeleted = false",
            parameters: [
              { name: "@albumId", value: album.id },
              { name: "@tenantId", value: tenantId },
            ],
          })
          .fetchAll();

        const mediaCount: number = counts[0] ?? 0;

        // Generate cover thumbnail SAS URL if set
        let coverThumbnailUrl: string | undefined;
        if (album.coverMediaId) {
          try {
            const { resources: coverMedia } = await mediaContainer.items
              .query<MediaRecord>({
                query:
                  "SELECT * FROM c WHERE c.id = @id AND c.albumId = @albumId AND c.tenantId = @tenantId",
                parameters: [
                  { name: "@id", value: album.coverMediaId },
                  { name: "@albumId", value: album.id },
                  { name: "@tenantId", value: tenantId },
                ],
              })
              .fetchAll();

            if (coverMedia[0]) {
              const { sasUrl } = await generateSasUrl(
                "thumbnails",
                coverMedia[0].thumbnailBlobName
              );
              coverThumbnailUrl = sasUrl;
            }
          } catch {
            // Cover image unavailable — continue without it
          }
        }

        return {
          id: album.id,
          tenantId: album.tenantId,
          name: album.name,
          description: album.description,
          coverThumbnailUrl,
          mediaCount,
          order: album.order,
        };
      })
    );

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.ALBUM_VIEWED,
      detail: { albumCount: items.length },
    });

    return NextResponse.json(items);
  } catch (err) {
    console.error("[albums] GET error:", err);
    return NextResponse.json({ error: "Failed to load albums" }, { status: 500 });
  }
}
