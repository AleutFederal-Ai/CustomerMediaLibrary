import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessAdmin } from "@/lib/auth/admin";
import { auditLogs } from "@/lib/azure/cosmos";
import { AuditLogRecord } from "@/types";
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

  if (!email) redirect("/login");
  const isAdmin = await canAccessAdmin(email);
  if (!isAdmin) redirect("/");

  const { items, cursor } = await getRecentAuditLogs();

  return (
    <AppShell>
      <TopBar>
        <div className="flex items-center gap-3">
          <BackLink href="/admin">Return to Admin</BackLink>
          <div>
            <p className="hero-kicker">Audit Timeline</p>
            <p className="text-sm text-[var(--text-muted)]">
              Cross-tenant activity and administrative events
            </p>
          </div>
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
