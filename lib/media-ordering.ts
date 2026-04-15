import { media } from "@/lib/azure/cosmos";
import { MediaRecord } from "@/types";
import { logInfo, logWarn } from "@/lib/logging/structured";

/**
 * Lazily assign an `order` value to every non-deleted media item in an
 * album that doesn't already have one. Called the first time a user
 * attempts to reorder an album so legacy media (uploaded before the
 * reorder feature shipped) gets a deterministic starting position.
 *
 * Ordering uses the same sort the gallery previously used —
 * `uploadedAt DESC` — so the initial order matches what users currently
 * see. Items that already have an `order` value are left untouched.
 *
 * Idempotent: safe to call on every reorder PATCH. When every item in
 * the album already has an `order`, it returns without writing anything.
 */
export async function ensureAlbumMediaOrdered(
  tenantId: string,
  albumId: string
): Promise<void> {
  const container = await media();

  const { resources } = await container.items
    .query<MediaRecord>({
      query: `
        SELECT * FROM c
        WHERE c.tenantId = @tenantId
          AND c.albumId = @albumId
          AND c.isDeleted = false
      `,
      parameters: [
        { name: "@tenantId", value: tenantId },
        { name: "@albumId", value: albumId },
      ],
    })
    .fetchAll();

  const needsBackfill = resources.filter((r) => typeof r.order !== "number");
  if (needsBackfill.length === 0) {
    return;
  }

  // Seed the starting index past any existing `order` values so we don't
  // collide with items the user has already reordered.
  const existingMax = resources.reduce<number>(
    (max, r) => (typeof r.order === "number" && r.order > max ? r.order : max),
    -1
  );
  let nextOrder = existingMax + 1;

  const sortedForBackfill = [...needsBackfill].sort((a, b) => {
    if (a.uploadedAt === b.uploadedAt) return 0;
    return a.uploadedAt < b.uploadedAt ? 1 : -1; // newest first
  });

  logInfo("media.ordering.backfill.start", {
    tenantId,
    albumId,
    itemsToBackfill: needsBackfill.length,
    existingOrdered: resources.length - needsBackfill.length,
  });

  for (const record of sortedForBackfill) {
    try {
      await container
        .item(record.id, record.id)
        .patch([{ op: "add", path: "/order", value: nextOrder }]);
      nextOrder += 1;
    } catch (err) {
      logWarn("media.ordering.backfill.item_failed", {
        tenantId,
        albumId,
        mediaId: record.id,
        error: (err as Error)?.message,
      });
    }
  }
}
