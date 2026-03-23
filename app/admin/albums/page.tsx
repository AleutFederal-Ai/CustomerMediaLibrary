import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord, TenantPublicItem } from "@/types";
import AlbumManager from "@/components/admin/AlbumManager";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

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
  if (!tenantId) redirect("/admin");
  const isAdmin = await isTenantAdmin(email, tenantId);
  if (!isAdmin) redirect("/");

  const [albumList, activeTenant] = await Promise.all([
    getTenantAlbums(tenantId),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href="/admin">Return to Admin</BackLink>
          <div>
            <p className="hero-kicker">Tenant Album Control</p>
            <p className="text-sm text-[var(--text-muted)]">
              {activeTenant?.name ?? "Active tenant"}
            </p>
          </div>
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-8 sm:space-y-8 sm:py-10">
        <HeroSection
          eyebrow="Album Administration"
          title={`Manage collection structure for ${activeTenant?.name ?? "this tenant"}.`}
          description="Create and order albums, assign cover imagery, and keep the tenant collection model clean and operationally useful."
          meta={
            <span className="chip chip-accent">
              Albums
              <strong>{albumList.filter((album) => !album.isDeleted).length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <AlbumManager initialAlbums={albumList} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
