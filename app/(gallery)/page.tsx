import { headers } from "next/headers";
import Link from "next/link";
import AlbumGrid from "@/components/gallery/AlbumGrid";
import { canAccessAdmin } from "@/lib/auth/admin";
import { AlbumListItem, TenantPublicItem } from "@/types";

export default async function GalleryHomePage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email") ?? "";
  const host = headerStore.get("host") ?? "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "").split(",").filter(Boolean);

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

  const [albums, isAdmin, activeTenant, userTenants] = await Promise.all([
    getAlbums(),
    canAccessAdmin(email),
    getActiveTenant(),
    getUserTenants(),
  ]);

  const brandColor = activeTenant?.brandColor ?? "#1e3a5f";

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Tenant brand bar */}
      {activeTenant?.brandColor && (
        <div className="h-1" style={{ backgroundColor: activeTenant.brandColor }} />
      )}

      {/* Nav */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTenant?.logoUrl ? (
            <img
              src={activeTenant.logoUrl}
              alt={activeTenant.name}
              className="w-7 h-7 rounded object-contain"
            />
          ) : (
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              {(activeTenant?.name ?? "M").charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-white font-semibold text-lg">
            {activeTenant?.name ?? "Media Gallery"}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Tenant switcher (only shown when user belongs to multiple tenants) */}
          {userTenants.length > 1 && (
            <Link
              href="/select-tenant"
              className="text-slate-400 hover:text-white text-sm transition-colors"
              title="Switch organization"
            >
              Switch org
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Admin
            </Link>
          )}
          <Link
            href="/api/auth/signout"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <AlbumGrid albums={albums} />
      </main>
    </div>
  );
}
