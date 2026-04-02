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

  const canonicalPath = buildGalleryAlbumPath(tenant.slug, albumId);

  if (activeTenantId !== tenant.id) {
    redirect(
      `/api/sessions/current?tenantId=${encodeURIComponent(tenant.id)}&next=${encodeURIComponent(canonicalPath)}`
    );
  }

  if (
    normalizedRequestedTenantSlug &&
    normalizedRequestedTenantSlug !== tenant.slug
  ) {
    redirect(canonicalPath);
  }

  return {
    albumId,
    albumName: album.name,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  };
}
