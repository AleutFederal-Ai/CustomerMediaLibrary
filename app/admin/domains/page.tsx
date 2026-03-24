import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getActiveTenantPublicItem } from "@/lib/tenant-data";
import { domains } from "@/lib/azure/cosmos";
import { DomainRecord } from "@/types";
import DomainManager from "@/components/admin/DomainManager";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getDomains(tenantId: string): Promise<DomainRecord[]> {
  const container = await domains();
  const { resources } = await container.items
    .query<DomainRecord>({
      query:
        "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.addedAt DESC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function AdminDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { email, activeTenantId: tenantId } =
    await getAdminTenantPageContext({
      currentPath: "/admin/domains",
      requestedTenantSlug,
    });

  if (!tenantId) redirect("/admin");
  const isAdmin = await isTenantAdmin(email, tenantId);
  if (!isAdmin) redirect("/");

  const [domainList, activeTenant] = await Promise.all([
    getDomains(tenantId),
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
            <p className="hero-kicker">Domain Governance</p>
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
          eyebrow="Access Domains"
          title={`Control automatic domain-based access for ${activeTenant?.name ?? "this tenant"}.`}
          description="Define trusted email domains that can receive immediate viewer access at login, and retire domain rules when they are no longer valid."
          meta={
            <span className="chip chip-accent">
              Active Domains
              <strong>{domainList.filter((domain) => domain.isActive).length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <DomainManager initialDomains={domainList} tenantId={tenantId} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
