import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
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

export default async function AdminAlbumsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { email, activeTenantId: tenantId, host, proto, cookieHeader } =
    await getAdminTenantPageContext({
      currentPath: "/admin/albums",
      requestedTenantSlug,
    });

  if (!tenantId) redirect("/admin");
  const isAdmin = await isTenantAdmin(email, tenantId);
  if (!isAdmin) redirect("/");

  const [albumList, activeTenant] = await Promise.all([
    getTenantAlbums(tenantId),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={buildAdminTenantPath("/admin", activeTenant?.slug)}>
            Return to Admin
          </BackLink>
          <div>
            <p className="hero-kicker">Tenant Album Control</p>
            <p className="text-sm text-[var(--text-muted)]">
              {activeTenant?.name ?? "Active tenant"}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <AccountMenu
            email={email}
            activeScopeLabel={activeTenant?.name ?? "Tenant"}
          />
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
          <AlbumManager initialAlbums={albumList} tenantId={tenantId} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
