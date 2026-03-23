import { headers } from "next/headers";
import Link from "next/link";
import AlbumCard from "@/components/gallery/AlbumCard";
import CreateAlbumCard from "@/components/gallery/CreateAlbumCard";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { AlbumListItem, TenantPublicItem } from "@/types";
import {
  AppShell,
  HeroSection,
  Metric,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

function TenantIdentity({
  tenant,
  fallbackColor,
}: {
  tenant: TenantPublicItem | null;
  fallbackColor: string;
}) {
  if (tenant?.logoUrl) {
    return (
      <img
        src={tenant.logoUrl}
        alt={tenant.name}
        className="h-11 w-11 rounded-2xl border border-white/10 bg-slate-950/50 object-contain p-2"
      />
    );
  }

  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
      style={{ backgroundColor: fallbackColor }}
    >
      {(tenant?.name ?? "M").charAt(0).toUpperCase()}
    </div>
  );
}

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

  async function getUserTenants(): Promise<TenantPublicItem[]> {
    if (tenantIds.length <= 1) return [];
    const res = await fetch(`${proto}://${host}/api/tenants`, {
      headers: baseHeaders,
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  }

  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";

  const [albums, isPlatformAdmin, isTenantAdm, activeTenant, userTenants] =
    await Promise.all([
      getAlbums(),
      canAccessAdmin(email),
      activeTenantId
        ? isTenantAdmin(email, activeTenantId)
        : Promise.resolve(false),
      getActiveTenant(),
      getUserTenants(),
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
          <TenantIdentity tenant={activeTenant} fallbackColor={brandColor} />
          <div className="space-y-1">
            <p className="hero-kicker">myMedia Operations</p>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.03em] text-white">
                {activeTenant?.name ?? "myMedia Platform"}
              </h1>
              <p className="ops-muted text-sm">
                Secure tenant media workspace
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {userTenants.length > 1 ? (
            <Link href="/select-tenant" className="ops-button-secondary">
              Switch Organization
            </Link>
          ) : null}
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
        <HeroSection
          eyebrow="Tenant Media Operations"
          title={
            <>
              Centralized mission media for{" "}
              <span className="text-[#d8f7ff]">{activeTenant?.name ?? "your team"}</span>
            </>
          }
          description={
            activeTenant?.description ??
            "Review, publish, and administer operational imagery and video inside a secure multi-tenant workspace."
          }
          actions={
            <>
              {isTenantAdm ? (
                <Link href="/admin/upload" className="ops-button">
                  Upload Media
                </Link>
              ) : null}
              {canManage ? (
                <Link href="/admin" className="ops-button-secondary">
                  Administrative Controls
                </Link>
              ) : null}
            </>
          }
          meta={
            <>
              <span className="chip chip-accent">
                <strong>{albums.length}</strong>
                {albums.length === 1 ? "Album" : "Albums"}
              </span>
              <span className="chip">
                Access Mode
                <strong>{roleLabel}</strong>
              </span>
              {tenantIds.length > 1 ? (
                <span className="chip">
                  Multi-Tenant
                  <strong>{tenantIds.length} Orgs</strong>
                </span>
              ) : null}
            </>
          }
        />

        <section className="grid gap-4 md:grid-cols-3">
          <Metric
            label="Published Collections"
            value={albums.length.toLocaleString()}
            subtext="Album workspaces available to this tenant context"
          />
          <Metric
            label="Access Boundary"
            value={activeTenant?.slug ?? "platform"}
            subtext="Current routing and tenant isolation scope"
          />
          <Metric
            label="Session Identity"
            value={email || "Unknown"}
            subtext="Authenticated principal operating in this workspace"
          />
        </section>

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

          {albums.length === 0 && !isTenantAdm ? (
            <div className="ops-empty">
              <p className="text-lg font-semibold text-white">
                No albums are currently available.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm">
                This tenant does not have any published content yet. Contact a
                tenant administrator if you expected to see media here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {isTenantAdm ? <CreateAlbumCard /> : null}
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          )}
        </section>
      </PageWidth>
    </AppShell>
  );
}
