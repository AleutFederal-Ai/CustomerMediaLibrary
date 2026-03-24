import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import AccountMenu from "@/components/account/AccountMenu";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { auditLogs } from "@/lib/azure/cosmos";
import { AuditLogRecord, TenantPublicItem } from "@/types";
import AuditLogViewer from "@/components/admin/AuditLogViewer";
import {
  AppShell,
  BackLink,
  HeroSection,
  PageWidth,
  TopBar,
} from "@/components/ui/AppFrame";

async function getRecentAuditLogs(): Promise<{
  items: AuditLogRecord[];
  cursor: string | null;
}> {
  const container = await auditLogs();
  const iterator = container.items.query<AuditLogRecord>(
    {
      query: "SELECT * FROM c ORDER BY c.timestamp DESC",
    },
    { maxItemCount: 100 }
  );
  const page = await iterator.fetchNext();
  return { items: page.resources, cursor: page.continuationToken ?? null };
}

export default async function AuditLogsPage() {
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

  const [{ items, cursor }, activeTenant] = await Promise.all([
    getRecentAuditLogs(),
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
            <p className="hero-kicker">Audit Timeline</p>
            <p className="text-sm text-[var(--text-muted)]">
              Cross-tenant activity and administrative events
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
          eyebrow="Audit Logs"
          title="Inspect operational history across the environment."
          description="Filter on user, IP, date range, or action type to trace critical access and administrative events through the platform."
          meta={
            <span className="chip chip-accent">
              Loaded Events
              <strong>{items.length}</strong>
            </span>
          }
        />

        <div className="surface-card rounded-[1.5rem] p-5 sm:p-6">
          <AuditLogViewer initialItems={items} initialCursor={cursor} />
        </div>
      </PageWidth>
    </AppShell>
  );
}
