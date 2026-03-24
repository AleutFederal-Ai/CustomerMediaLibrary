import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isMediaContributor } from "@/lib/auth/permissions";
import { getActiveTenantPublicItem } from "@/lib/tenant-data";
import { albums } from "@/lib/azure/cosmos";
import { AlbumRecord } from "@/types";
import UploadForm from "@/components/admin/UploadForm";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getActiveAlbums(tenantId: string): Promise<{ id: string; name: string }[]> {
  const container = await albums();
  const { resources } = await container.items
    .query<AlbumRecord>({
      query:
        "SELECT c.id, c.name FROM c WHERE c.tenantId = @tenantId AND c.isDeleted = false ORDER BY c['order'] ASC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { email, activeTenantId: tenantId } =
    await getAdminTenantPageContext({
      currentPath: "/admin/upload",
      requestedTenantSlug,
    });

  if (!tenantId) redirect("/admin");
  const canUpload = await isMediaContributor(email, tenantId);
  if (!canUpload) redirect("/");

  const [albumList, activeTenant] = await Promise.all([
    getActiveAlbums(tenantId),
    getActiveTenantPublicItem(tenantId),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={buildAdminTenantPath("/admin", activeTenant?.slug)}>
            Return to Admin
          </BackLink>
          <div>
            <p className="hero-kicker">Media Intake</p>
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
          eyebrow="Upload Workflow"
          title={`Add new media into ${activeTenant?.name ?? "this tenant"}.`}
          description="Select a target album, upload approved files, and attach tags that improve searchability across the tenant workspace."
          meta={
            <span className="chip chip-accent">
              Available Albums
              <strong>{albumList.length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          {albumList.length === 0 ? (
            <div className="ops-empty">
              <p className="text-lg font-semibold text-white">
                No albums exist yet.
              </p>
              <p className="mx-auto mt-2 max-w-xl text-sm">
                Create an album first so uploaded media can be routed into an
                approved collection.
              </p>
              <Link
                href={buildAdminTenantPath("/admin/albums", activeTenant?.slug)}
                className="ops-button mt-6 inline-flex"
              >
                Create an Album
              </Link>
            </div>
          ) : (
            <UploadForm albums={albumList} />
          )}
        </div>
      </PageWidth>
    </AppShell>
  );
}
