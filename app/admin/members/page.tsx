import { redirect } from "next/navigation";
import AccountMenu from "@/components/account/AccountMenu";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getActiveTenantPublicItem } from "@/lib/tenant-data";
import { memberships, users } from "@/lib/azure/cosmos";
import { MembershipRecord, UserAdminListItem } from "@/types";
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

async function getRecentUsers(): Promise<UserAdminListItem[]> {
  const container = await users();
  const { resources } = await container.items
    .query<UserAdminListItem>({
      query:
        "SELECT c.id, c.email, c.lastLoginAt, c.loginCount, c.isBlocked, c.isPlatformAdmin FROM c ORDER BY c.lastLoginAt DESC",
    })
    .fetchAll();
  return resources.slice(0, 50);
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { headerStore, email, activeTenantId: tenantId } =
    await getAdminTenantPageContext({
      currentPath: "/admin/members",
      requestedTenantSlug,
    });

  if (!tenantId) redirect("/admin");

  const isPlatformAdmin = await canAccessAdmin(email);
  const impersonatorEmail = headerStore.get("x-impersonator-email") ?? undefined;
  const adminCheckEmail = impersonatorEmail ?? email;
  const isAdmin = isPlatformAdmin || (await isTenantAdmin(adminCheckEmail, tenantId));

  if (!isAdmin) redirect("/");

  const [memberList, activeTenant, userList] = await Promise.all([
    getMembers(tenantId),
    getActiveTenantPublicItem(tenantId),
    isPlatformAdmin ? getRecentUsers() : Promise.resolve([]),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={buildAdminTenantPath("/admin", activeTenant?.slug)}>
            Return to Admin
          </BackLink>
          <div>
            <p className="hero-kicker">Unified User Administration</p>
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
          eyebrow="User and Membership Governance"
          title={`Manage users and access for ${activeTenant?.name ?? "this tenant"}.`}
          description="Single-pane governance for tenant membership changes, platform-level controls, and compliant user impersonation when platform administrators need break-glass troubleshooting."
          meta={
            <span className="chip chip-accent">
              Active Members
              <strong>{memberList.filter((member) => member.isActive).length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <MemberManager
            initialMembers={memberList}
            tenantId={tenantId}
            initialUsers={userList}
            isPlatformAdmin={isPlatformAdmin}
            impersonatedBy={impersonatorEmail}
          />
        </div>
      </PageWidth>
    </AppShell>
  );
}
