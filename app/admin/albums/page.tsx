import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord, TenantPublicItem } from "@/types";
import AlbumManager from "@/components/admin/AlbumManager";

async function getTenantAlbums(tenantId: string): Promise<AlbumRecord[]> {
  const container = await albums();
  const { resources } = await container.items
    .query<AlbumRecord>({
      query:
        "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c['order'] ASC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function AdminAlbumsPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const tenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");
  const isAdmin = await canAccessAdmin(email);
  if (!isAdmin) redirect("/");

  const [albumList, activeTenant] = await Promise.all([
    getTenantAlbums(tenantId),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) =>
        r.ok ? (r.json() as Promise<TenantPublicItem>) : null
      )
      .catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link
          href="/admin"
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          &larr; Admin
        </Link>
        <h1 className="text-white font-semibold">
          Albums{activeTenant ? ` \u2014 ${activeTenant.name}` : ""}
        </h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <AlbumManager initialAlbums={albumList} />
      </main>
    </div>
  );
}
