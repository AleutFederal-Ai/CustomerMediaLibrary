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

/**
 * Resolve an album by slug within a given tenant.
 * Returns null if no active album matches the slug.
 */
export async function getAlbumBySlug(
  slug: string,
  tenantId: string
): Promise<AlbumRecord | null> {
  try {
    const albumsContainer = await albums();
    const { resources } = await albumsContainer.items
      .query<AlbumRecord>({
        query:
          "SELECT * FROM c WHERE c.slug = @slug AND c.tenantId = @tenantId AND c.isDeleted = false",
        parameters: [
          { name: "@slug", value: slug.toLowerCase() },
          { name: "@tenantId", value: tenantId },
        ],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve an album by either ID (UUID) or slug within a tenant.
 * Tries ID lookup first, then falls back to slug lookup.
 */
export async function getAlbumByIdOrSlug(
  idOrSlug: string,
  tenantId: string
): Promise<AlbumRecord | null> {
  // Try direct ID lookup first (fast point-read)
  const byId = await getAlbumById(idOrSlug);
  if (byId && byId.tenantId === tenantId) return byId;

  // Fall back to slug query
  return getAlbumBySlug(idOrSlug, tenantId);
}

/**
 * Generate a URL-safe slug from an album name.
 * Strips special chars, lowercases, replaces spaces with hyphens.
 */
export function generateAlbumSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Ensure a slug is unique within a tenant by appending a numeric suffix if needed.
 */
export async function ensureUniqueAlbumSlug(
  slug: string,
  tenantId: string,
  excludeAlbumId?: string
): Promise<string> {
  const albumsContainer = await albums();
  let candidate = slug;
  let suffix = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { resources } = await albumsContainer.items
      .query<Pick<AlbumRecord, "id">>({
        query:
          "SELECT c.id FROM c WHERE c.slug = @slug AND c.tenantId = @tenantId AND c.isDeleted = false",
        parameters: [
          { name: "@slug", value: candidate },
          { name: "@tenantId", value: tenantId },
        ],
      })
      .fetchAll();

    const conflict = excludeAlbumId
      ? resources.some((r) => r.id !== excludeAlbumId)
      : resources.length > 0;

    if (!conflict) return candidate;

    suffix += 1;
    candidate = `${slug}-${suffix}`;
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
        slug: album.slug,
        description: album.description,
        coverMediaId: album.coverMediaId ?? coverRecord?.id,
        coverThumbnailUrl,
        mediaCount,
        order: album.order,
      };
    })
  );
}
