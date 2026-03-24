import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { memberships } from "@/lib/azure/cosmos";
import { MembershipRecord, TenantPublicItem } from "@/types";
import MemberManager from "@/components/admin/MemberManager";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getMembers(tenantId: string): Promise<MembershipRecord[]> {
  const container = await memberships();
  const { resources } = await container.items
    .query<MembershipRecord>({
      query:
        "SELECT * FROM c WHERE c.tenantId = @tenantId AND c.isActive = true ORDER BY c.addedAt DESC",
      parameters: [{ name: "@tenantId", value: tenantId }],
    })
    .fetchAll();
  return resources;
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { email, activeTenantId: tenantId, host, proto, cookieHeader } =
    await getAdminTenantPageContext({
      currentPath: "/admin/members",
      requestedTenantSlug,
    });

  if (!tenantId) redirect("/admin");
  const isAdmin = await isTenantAdmin(email, tenantId);
  if (!isAdmin) redirect("/");

  const [memberList, activeTenant] = await Promise.all([
    getMembers(tenantId),
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
            <p className="hero-kicker">Tenant Membership</p>
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
          eyebrow="Membership Control"
          title={`Manage access inside ${activeTenant?.name ?? "this tenant"}.`}
          description="Invite members, update contributor and admin roles, and keep tenant access aligned with operational need."
          meta={
            <span className="chip chip-accent">
              Active Members
              <strong>{memberList.filter((member) => member.isActive).length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <MemberManager initialMembers={memberList} tenantId={tenantId} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
