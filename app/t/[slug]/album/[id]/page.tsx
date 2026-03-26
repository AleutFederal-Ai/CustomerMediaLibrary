import { headers } from "next/headers";
import AlbumWorkspacePage from "@/components/gallery/AlbumWorkspacePage";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getGalleryAlbumPageContext } from "@/lib/auth/gallery-album-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { listVisibleTenantsForSession } from "@/lib/tenant-data";

export default async function TenantAlbumPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { albumId, albumName, tenantId, tenantName, tenantSlug } =
    await getGalleryAlbumPageContext({
    albumId: id,
    requestedTenantSlug: slug,
  });
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const [isPlatformAdmin, isTenantAdm, userTenants] = await Promise.all([
    canAccessAdmin(email),
    isTenantAdmin(email, tenantId),
    listVisibleTenantsForSession({ email, tenantIds }),
  ]);
  const canManage = isPlatformAdmin || isTenantAdm;

  return (
    <AlbumWorkspacePage
      albumId={albumId}
      initialAlbumName={albumName}
      tenantName={tenantName}
      tenantId={tenantId}
      tenantSlug={tenantSlug}
      sessionEmail={email}
      tenantOptions={userTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      }))}
      canSwitchTenant={canManage}
      adminHref={canManage ? buildAdminTenantPath("/admin", tenantSlug) : undefined}
    />
  );
}
