import { headers } from "next/headers";
import { redirect } from "next/navigation";
import GalleryAlbumWorkspace from "@/components/gallery/GalleryAlbumWorkspace";
import { canAccessAdmin } from "@/lib/auth/admin";
import { buildAdminTenantPath, buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { listAlbumItemsForTenant } from "@/lib/gallery/albums";
import {
  getActiveTenantPublicItem,
  listVisibleTenantsForSession,
} from "@/lib/tenant-data";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";
import PlatformHeader from "@/components/ui/PlatformHeader";

interface Props {
  requestedSlug?: string;
}

export default async function GalleryWorkspacePage({
  requestedSlug,
}: Props) {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (requestedSlug) {
    const normalizedSlug = requestedSlug.toLowerCase();
    const targetTenant = await getTenantBySlug(normalizedSlug);

    if (!targetTenant) {
      redirect("/select-tenant");
    }

    if (activeTenantId !== targetTenant.id) {
      redirect(
        `/api/sessions/current?tenantId=${encodeURIComponent(targetTenant.id)}&next=${encodeURIComponent(`/t/${normalizedSlug}`)}`
      );
    }
  }

  const [activeTenant, isPlatformAdmin, userTenants] = await Promise.all([
    getActiveTenantPublicItem(activeTenantId),
    canAccessAdmin(email),
    listVisibleTenantsForSession({ email, tenantIds }),
  ]);

  if (!activeTenant) {
    if (userTenants.length === 1) {
      redirect(`/t/${userTenants[0].slug}`);
    }

    if (userTenants.length > 1) {
      redirect("/select-tenant");
    }

    if (isPlatformAdmin) {
      redirect("/admin");
    }

    redirect("/login");
  }

  if (requestedSlug && activeTenant.slug !== requestedSlug.toLowerCase()) {
    redirect(`/t/${activeTenant.slug}`);
  }

  const albums = await listAlbumItemsForTenant(activeTenant.id);
  const isTenantAdm = await isTenantAdmin(email, activeTenant.id);
  const canManage = isPlatformAdmin || isTenantAdm;
  const adminHref = canManage
    ? buildAdminTenantPath("/admin", activeTenant.slug)
    : undefined;

  return (
    <AppShell variant="gallery">
      <PlatformHeader
        homeHref={buildGalleryWorkspacePath(activeTenant.slug)}
        tenantName={activeTenant.name}
        pageLabel="Albums"
        email={email}
        activeScopeLabel={activeTenant.name}
        activeTenantId={activeTenant.id}
        tenantOptions={userTenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        }))}
        canSwitchTenant={canManage}
        adminHref={adminHref}
      />

      <PageWidth className="space-y-6 py-6 sm:space-y-8 sm:py-8">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                Albums
              </h2>
              <p className="text-sm leading-6 text-[color:var(--text-muted)]">
                {canManage
                  ? "Open an album or create a new one."
                  : "Choose an album to start viewing media."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isTenantAdm ? (
                <span className="chip chip-accent">Can create albums</span>
              ) : (
                <span className="chip">View and download access</span>
              )}
            </div>
          </div>

          <GalleryAlbumWorkspace
            initialAlbums={albums}
            canCreate={isTenantAdm}
            tenantId={activeTenant.id}
            tenantSlug={activeTenant.slug}
          />
        </section>
      </PageWidth>
    </AppShell>
  );
}
