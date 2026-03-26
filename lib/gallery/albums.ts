import { albums, media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { AlbumListItem, AlbumRecord, MediaRecord } from "@/types";

export async function getAlbumById(albumId: string): Promise<AlbumRecord | null> {
  try {
    const albumsContainer = await albums();
    const { resource } = await albumsContainer
      .item(albumId, albumId)
      .read<AlbumRecord>();

    if (!resource || resource.isDeleted) {
      return null;
    }

    return resource;
  } catch {
    return null;
  }
}

export async function listAlbumItemsForTenant(
  tenantId: string
): Promise<AlbumListItem[]> {
  const albumsContainer = await albums();
  const { resources: albumList } = await albumsContainer.items
    .query<AlbumRecord>({
      query:
        "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c['order'] ASC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();

  const mediaContainer = await media();

  return Promise.all(
    albumList.map(async (album) => {
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

      const mediaCount = counts[0] ?? 0;

      async function resolveCoverRecord(): Promise<MediaRecord | null> {
        if (album.coverMediaId) {
          try {
            const { resources: coverMedia } = await mediaContainer.items
              .query<MediaRecord>({
                query:
                  "SELECT * FROM c WHERE c.id = @id AND c.albumId = @albumId AND c.tenantId = @tenantId AND c.isDeleted = false",
                parameters: [
                  { name: "@id", value: album.coverMediaId },
                  { name: "@albumId", value: album.id },
                  { name: "@tenantId", value: tenantId },
                ],
              })
              .fetchAll();

            if (coverMedia[0]) {
              return coverMedia[0];
            }
          } catch {
            // Best effort only. Fall through to automatic cover selection.
          }
        }

        const fallbackQueries = [
          {
            query:
              "SELECT TOP 1 * FROM c WHERE c.albumId = @albumId AND c.tenantId = @tenantId AND c.isDeleted = false AND c.fileType = 'image' ORDER BY c.uploadedAt ASC",
            parameters: [
              { name: "@albumId", value: album.id },
              { name: "@tenantId", value: tenantId },
            ],
          },
          {
            query:
              "SELECT TOP 1 * FROM c WHERE c.albumId = @albumId AND c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c.uploadedAt ASC",
            parameters: [
              { name: "@albumId", value: album.id },
              { name: "@tenantId", value: tenantId },
            ],
          },
        ];

        for (const fallbackQuery of fallbackQueries) {
          const { resources } = await mediaContainer.items
            .query<MediaRecord>(fallbackQuery)
            .fetchAll();

          if (resources[0]) {
            return resources[0];
          }
        }

        return null;
      }

      const coverRecord = await resolveCoverRecord();
      let coverThumbnailUrl: string | undefined;
      if (coverRecord) {
        try {
          const { sasUrl } = await generateSasUrl(
            "thumbnails",
            coverRecord.thumbnailBlobName
          );
          coverThumbnailUrl = sasUrl;
        } catch {
          // Best effort only. The album remains usable without a cover image.
        }
      }

      return {
        id: album.id,
        tenantId: album.tenantId,
        name: album.name,
        description: album.description,
        coverMediaId: album.coverMediaId ?? coverRecord?.id,
        coverThumbnailUrl,
        mediaCount,
        order: album.order,
      };
    })
  );
}
