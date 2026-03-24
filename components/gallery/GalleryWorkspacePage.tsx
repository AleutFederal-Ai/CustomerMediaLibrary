import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import GalleryAlbumWorkspace from "@/components/gallery/GalleryAlbumWorkspace";
import TenantScopeRibbon from "@/components/gallery/TenantScopeRibbon";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getTenantBySlug } from "@/lib/auth/tenant";
import { AlbumListItem, TenantPublicItem } from "@/types";
import { AppShell, PageWidth, TopBar } from "@/components/ui/AppFrame";

interface Props {
  requestedSlug?: string;
}

export default async function GalleryWorkspacePage({
  requestedSlug,
}: Props) {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
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

  async function getTenantOptions(): Promise<TenantPublicItem[]> {
    const res = await fetch(`${proto}://${host}/api/tenants`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  }

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

  const [albums, isPlatformAdmin, activeTenant, userTenants] = await Promise.all([
    getAlbums(),
    canAccessAdmin(email),
    getActiveTenant(),
    getTenantOptions(),
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

  const isTenantAdm = await isTenantAdmin(email, activeTenant.id);
  const brandColor = activeTenant.brandColor ?? "#174365";
  const canManage = isPlatformAdmin || isTenantAdm;
  const roleLabel = isPlatformAdmin
    ? "Platform Admin"
    : isTenantAdm
      ? "Tenant Admin"
      : "Authorized Viewer";

  return (
    <AppShell>
      <TopBar accentColor={activeTenant.brandColor}>
        <div className="flex items-center gap-4">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
            style={{ backgroundColor: brandColor }}
          >
            {activeTenant.name.charAt(0).toUpperCase()}
          </div>
          <div className="space-y-1">
            <p className="hero-kicker">myMedia Operations</p>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.03em] text-white">
                {activeTenant.name}
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
            tenantId={activeTenant.id}
          />
        </section>
      </PageWidth>
    </AppShell>
  );
}
