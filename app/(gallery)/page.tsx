import { headers } from "next/headers";
import Link from "next/link";
import GalleryAlbumWorkspace from "@/components/gallery/GalleryAlbumWorkspace";
import TenantScopeRibbon from "@/components/gallery/TenantScopeRibbon";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { tenants as tenantsContainer } from "@/lib/azure/cosmos";
import { AlbumListItem, TenantPublicItem, TenantRecord } from "@/types";
import {
  AppShell,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

export default async function GalleryHomePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "")
    .split(",")
    .filter(Boolean);

  const baseHeaders = { cookie: headerStore.get("cookie") ?? "" };

  async function getAlbums(): Promise<AlbumListItem[]> {
    const res = await fetch(`${proto}://${host}/api/albums`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  }

  async function getActiveTenant(): Promise<TenantPublicItem | null> {
    const res = await fetch(`${proto}://${host}/api/tenants/current`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function getTenantOptions(
    isPlatformAdmin: boolean
  ): Promise<TenantPublicItem[]> {
    try {
      const container = await tenantsContainer();

      if (isPlatformAdmin) {
        const { resources } = await container.items
          .query<TenantRecord>({
            query: "SELECT * FROM c WHERE c.isActive = true ORDER BY c.name ASC",
          })
          .fetchAll();

        return resources.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          ...(tenant.description && { description: tenant.description }),
          ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
          ...(tenant.brandColor && { brandColor: tenant.brandColor }),
        }));
      }

      if (tenantIds.length <= 1) return [];

      const { resources } = await container.items
        .query<TenantRecord>({
          query: `SELECT * FROM c WHERE c.id IN (${tenantIds
            .map((_, index) => `@tenant${index}`)
            .join(", ")}) AND c.isActive = true ORDER BY c.name ASC`,
          parameters: tenantIds.map((tenantId, index) => ({
            name: `@tenant${index}`,
            value: tenantId,
          })),
        })
        .fetchAll();

      return resources.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        ...(tenant.description && { description: tenant.description }),
        ...(tenant.logoUrl && { logoUrl: tenant.logoUrl }),
        ...(tenant.brandColor && { brandColor: tenant.brandColor }),
      }));
    } catch {
      return [];
    }
  }

  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  const [albums, isPlatformAdmin, activeTenant] = await Promise.all([
    getAlbums(),
    canAccessAdmin(email),
    getActiveTenant(),
  ]);

  const [isTenantAdm, userTenants] = await Promise.all([
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
    getTenantOptions(isPlatformAdmin),
  ]);

  const brandColor = activeTenant?.brandColor ?? "#174365";
  const canManage = isPlatformAdmin || isTenantAdm;
  const roleLabel = isPlatformAdmin
    ? "Platform Admin"
    : isTenantAdm
    ? "Tenant Admin"
    : "Authorized Viewer";

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
            style={{ backgroundColor: brandColor }}
          >
            M
          </div>
          <div className="space-y-1">
            <p className="hero-kicker">myMedia Operations</p>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.03em] text-white">
                myMedia Platform
              </h1>
              <p className="ops-muted text-sm">
                Secure tenant media workspace
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {canManage ? (
            <Link href="/admin" className="ops-button-secondary">
              Open Admin Console
            </Link>
          ) : null}
          <Link href="/api/auth/signout" className="ops-button-ghost">
            Sign Out
          </Link>
        </div>
      </TopBar>

      <PageWidth className="space-y-8 py-8 sm:space-y-10 sm:py-10">
        <TenantScopeRibbon
          activeTenant={activeTenant}
          tenants={userTenants}
          roleLabel={roleLabel}
          albumCount={albums.length}
        />

        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <p className="hero-kicker">Content Workspace</p>
              <h2 className="section-title">
                {canManage ? "Manageable albums" : "Available albums"}
              </h2>
              <p className="section-copy">
                Browse published collections, open an album workspace, or add a
                new collection when your tenant role allows it.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {isTenantAdm ? (
                <span className="chip chip-accent">
                  Create, curate, and publish
                </span>
              ) : (
                <span className="chip">Read-only delivery surface</span>
              )}
            </div>
          </div>

          <GalleryAlbumWorkspace
            initialAlbums={albums}
            canCreate={isTenantAdm}
            tenantId={activeTenantId}
          />
        </section>
      </PageWidth>
    </AppShell>
  );
}
