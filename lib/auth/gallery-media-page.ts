import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildGalleryMediaPath,
  buildGalleryWorkspacePath,
} from "@/lib/admin-scope";
import { getTenantById } from "@/lib/auth/tenant";
import { getMediaById } from "@/lib/gallery/media";

export async function getGalleryMediaPageContext({
  mediaId,
  requestedTenantSlug,
}: {
  mediaId: string;
  requestedTenantSlug?: string;
}) {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  if (!email) {
    redirect("/login");
  }

  const mediaItem = await getMediaById(mediaId);
  const normalizedRequestedTenantSlug = requestedTenantSlug?.trim().toLowerCase();

  if (!mediaItem) {
    redirect(buildGalleryWorkspacePath(normalizedRequestedTenantSlug));
  }

  const tenant = await getTenantById(mediaItem.tenantId);

  if (!tenant) {
    redirect(buildGalleryWorkspacePath(normalizedRequestedTenantSlug));
  }

  const canonicalPath = buildGalleryMediaPath(tenant.slug, mediaId);

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
    mediaId,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    albumId: mediaItem.albumId,
  };
}
