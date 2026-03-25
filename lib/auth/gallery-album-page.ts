import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildGalleryAlbumPath, buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { getTenantById } from "@/lib/auth/tenant";
import { getAlbumById } from "@/lib/gallery/albums";

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

  const album = await getAlbumById(albumId);
  const normalizedRequestedTenantSlug = requestedTenantSlug?.trim().toLowerCase();

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
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
  };
}
