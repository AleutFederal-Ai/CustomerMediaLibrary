import { headers } from "next/headers";
import SingleMediaWorkspace from "@/components/gallery/SingleMediaWorkspace";
import { canAccessAdmin } from "@/lib/auth/admin";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getGalleryMediaPageContext } from "@/lib/auth/gallery-media-page";
import { listVisibleTenantsForSession } from "@/lib/tenant-data";

export default async function TenantMediaPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { mediaId, albumId, tenantId, tenantName, tenantSlug } =
    await getGalleryMediaPageContext({
    mediaId: id,
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
    <SingleMediaWorkspace
      mediaId={mediaId}
      albumId={albumId}
      tenantId={tenantId}
      tenantName={tenantName}
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
