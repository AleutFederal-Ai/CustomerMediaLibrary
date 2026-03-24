import { albums, media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { AlbumListItem, AlbumRecord, MediaRecord } from "@/types";

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
          // Best effort only. The album remains usable without a cover image.
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
}
