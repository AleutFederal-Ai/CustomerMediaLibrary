import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import GalleryAlbumWorkspace from "@/components/gallery/GalleryAlbumWorkspace";
import AccountMenu from "@/components/account/AccountMenu";
import TenantScopeRibbon from "@/components/gallery/TenantScopeRibbon";
import { canAccessAdmin } from "@/lib/auth/admin";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { listAlbumItemsForTenant } from "@/lib/gallery/albums";
import {
  getActiveTenantPublicItem,
  listVisibleTenantsForSession,
} from "@/lib/tenant-data";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";

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
  const brandColor = activeTenant.brandColor ?? "#174365";
  const canManage = isPlatformAdmin || isTenantAdm;
  const roleLabel = isPlatformAdmin
    ? "Platform Admin"
    : isTenantAdm
      ? "Tenant Admin"
      : "Authorized Viewer";

  return (
    <AppShell variant="gallery">
      <PageWidth className="space-y-6 py-6 sm:space-y-8 sm:py-8">
        <header className="surface-card rounded-[1.75rem] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_12px_26px_rgba(15,23,42,0.12)]"
                style={{ backgroundColor: brandColor }}
              >
                {activeTenant.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-[color:var(--text-muted)]">
                  Tenant workspace
                </p>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    {activeTenant.name}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
                    {canManage
                      ? "Open an album, create a new one, or jump into the admin console when you need to manage content."
                      : "Open an album to view and download the media shared with you."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                {canManage ? (
                  <Link
                    href={buildAdminTenantPath("/admin", activeTenant.slug)}
                    className="ops-button-secondary"
                  >
                    Admin Console
                  </Link>
                ) : null}
                <AccountMenu
                  email={email}
                  activeScopeLabel={activeTenant.name}
                />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <TenantScopeRibbon
              activeTenant={activeTenant}
              tenants={userTenants}
              roleLabel={roleLabel}
              albumCount={albums.length}
            />
          </div>
        </header>

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
