import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import AccountMenu from "@/components/account/AccountMenu";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { users } from "@/lib/azure/cosmos";
import { UserAdminListItem, TenantPublicItem } from "@/types";
import UserManager from "@/components/admin/UserManager";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getRecentUsers(): Promise<{
  items: UserAdminListItem[];
  cursor: string | null;
}> {
  const container = await users();
  const iterator = container.items.query<UserAdminListItem>(
    {
      query:
        "SELECT c.id, c.email, c.lastLoginAt, c.loginCount, c.isBlocked, c.isPlatformAdmin FROM c ORDER BY c.lastLoginAt DESC",
    },
    { maxItemCount: 50 }
  );
  const page = await iterator.fetchNext();
  return {
    items: page.resources,
    cursor: page.continuationToken ?? null,
  };
}

export default async function AdminUsersPage() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");
  const isAdmin = await canAccessAdmin(email);
  if (!isAdmin) redirect("/");

  const [{ items: userList, cursor }, activeTenant] = await Promise.all([
    getRecentUsers(),
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
          <BackLink href={buildAdminTenantPath("/admin", activeTenant?.slug)}>
            Return to Admin
          </BackLink>
          <div>
            <p className="hero-kicker">User Governance</p>
            <p className="text-sm text-[var(--text-muted)]">
              Cross-tenant platform access control
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <AccountMenu
            email={email}
            activeScopeLabel={activeTenant?.name ?? "Platform"}
          />
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-8 sm:space-y-8 sm:py-10">
        <HeroSection
          eyebrow="User Control"
          title="Review user posture across the platform."
          description="Search for user records, block or restore access, assign platform administrator rights, and set password credentials when required."
          meta={
            <span className="chip chip-accent">
              Loaded Users
              <strong>{userList.length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <UserManager initialUsers={userList} initialCursor={cursor} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
