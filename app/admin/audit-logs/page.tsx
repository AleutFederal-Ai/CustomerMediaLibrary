import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { auditLogs } from "@/lib/azure/cosmos";
import { AuditLogRecord } from "@/types";
import AuditLogViewer from "@/components/admin/AuditLogViewer";

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
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Admin
        </Link>
        <h1 className="text-white font-semibold">Audit Logs</h1>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AuditLogViewer initialItems={items} initialCursor={cursor} />
      </main>
    </div>
  );
}
