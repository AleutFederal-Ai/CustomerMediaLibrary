import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildGalleryAlbumPath, buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { getTenantById, getTenantBySlug } from "@/lib/auth/tenant";
import { getAlbumById, getAlbumByIdOrSlug } from "@/lib/gallery/albums";

export async function getGalleryAlbumPageContext({
  albumId,
  requestedTenantSlug,
}: {
  albumId: string;
  requestedTenantSlug?: string;
}) {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  if (!email) {
    redirect("/login");
  }

  const normalizedRequestedTenantSlug = requestedTenantSlug?.trim().toLowerCase();

  // Resolve the tenant to get tenantId for slug-based album lookups
  let resolvedTenantId = activeTenantId;
  if (normalizedRequestedTenantSlug) {
    const tenant = await getTenantBySlug(normalizedRequestedTenantSlug);
    if (tenant) resolvedTenantId = tenant.id;
  }

  // Try ID first, then slug within the tenant context
  const album = resolvedTenantId
    ? await getAlbumByIdOrSlug(albumId, resolvedTenantId)
    : await getAlbumById(albumId);

  if (!album) {
    redirect(buildGalleryWorkspacePath(normalizedRequestedTenantSlug));
  }

  const tenant = await getTenantById(album.tenantId);

  if (!tenant) {
    redirect(buildGalleryWorkspacePath(normalizedRequestedTenantSlug));
  }

  // Use the resolved album ID (UUID), not the route param which may be a slug.
  // Downstream components (search, upload) need the UUID to query Cosmos DB.
  const resolvedAlbumId = album.id;
  const canonicalAlbumIdentifier = album.slug || resolvedAlbumId;
  const canonicalPath = buildGalleryAlbumPath(tenant.slug, canonicalAlbumIdentifier);

  if (activeTenantId !== tenant.id) {
    redirect(
      `/api/sessions/current?tenantId=${encodeURIComponent(tenant.id)}&next=${encodeURIComponent(canonicalPath)}`
    );
  }

  // Redirect to canonical URL if the tenant slug doesn't match
  if (
    normalizedRequestedTenantSlug &&
    normalizedRequestedTenantSlug !== tenant.slug
  ) {
    redirect(canonicalPath);
  }

  // Redirect to slug-based URL if album was accessed by ID and has a slug
  if (album.slug && albumId !== album.slug && albumId === album.id) {
    redirect(buildGalleryAlbumPath(tenant.slug, album.slug));
  }

  return {
    albumId: resolvedAlbumId,
    albumName: album.name,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  };
}
