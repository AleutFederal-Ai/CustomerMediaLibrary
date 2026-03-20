import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { TenantPublicItem, AuditLogRecord } from "@/types";
import AdminTenantSection from "./AdminTenantSection";

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  brandColor?: string;
  logoUrl?: string;
  isActive: boolean;
  albumCount: number;
  mediaCount: number;
  memberCount: number;
  storageMB: number;
}

interface StatsResponse {
  totals: {
    tenants: number;
    activeTenants: number;
    users: number;
    media: number;
    albums: number;
    storageMB: number;
    activeSessions: number;
  };
  recentActivity: AuditLogRecord[];
  tenantSummaries: TenantSummary[];
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AdminDashboard() {
  const headerStore = await headers();
  const email = headerStore.get("x-session-email");
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");

  const [isAdmin, activeTenant, stats] = await Promise.all([
    canAccessAdmin(email),
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
    fetch(`${proto}://${host}/api/admin/stats`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : null))
      .catch(() => null),
  ]);

  if (!isAdmin) redirect("/");

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            &larr; Gallery
          </Link>
          <h1 className="text-white font-semibold">Admin Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm">{email}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* ═══════════════════════════════════════════════════════════
            PLATFORM ADMINISTRATION (top)
            ═══════════════════════════════════════════════════════════ */}

        {/* ─── KPI Row ────────────────────────────────────────────── */}
        {stats && (
          <section>
            <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
              Platform Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: "Tenants",
                  value: stats.totals.activeTenants,
                  sub: `${stats.totals.tenants} total`,
                },
                { label: "Users", value: stats.totals.users },
                { label: "Media Files", value: stats.totals.media },
                {
                  label: "Storage",
                  value:
                    stats.totals.storageMB >= 1024
                      ? `${(stats.totals.storageMB / 1024).toFixed(1)} GB`
                      : `${stats.totals.storageMB} MB`,
                },
                {
                  label: "Active Sessions",
                  value: stats.totals.activeSessions,
                },
                { label: "Albums", value: stats.totals.albums },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="p-4 bg-slate-800 border border-slate-700 rounded-lg"
                >
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                    {kpi.label}
                  </p>
                  <p className="text-white text-2xl font-semibold mt-1">
                    {kpi.value}
                  </p>
                  {kpi.sub && (
                    <p className="text-slate-500 text-xs mt-0.5">{kpi.sub}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Platform Admin Links ───────────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
            Platform Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                href: "/admin/tenants",
                label: "Organizations",
                description: "Create and manage tenant organizations",
              },
              {
                href: "/admin/users",
                label: "Manage Users",
                description:
                  "View users, block, set passwords, promote admins",
              },
              {
                href: "/admin/audit-logs",
                label: "Audit Logs",
                description:
                  "Review all system activity across all tenants",
              },
            ].map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="block p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors group"
              >
                <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors text-sm">
                  {s.label}
                </h3>
                <p className="text-slate-400 text-xs mt-1">{s.description}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── Recent Activity ────────────────────────────────────── */}
        {stats && stats.recentActivity.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                Recent Activity
              </h2>
              <Link
                href="/admin/audit-logs"
                className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
              >
                View all &rarr;
              </Link>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-700">
                  {stats.recentActivity.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap w-24">
                        {formatRelativeTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs">
                        {log.userEmail}
                      </td>
                      <td className="px-4 py-2.5 text-white text-xs">
                        {formatAction(log.action)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs truncate max-w-[200px]">
                        {log.ipAddress}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            TENANT ADMINISTRATION (bottom — with context switcher)
            ═══════════════════════════════════════════════════════════ */}

        <AdminTenantSection
          activeTenant={activeTenant}
          tenantSummaries={stats?.tenantSummaries ?? []}
        />
      </main>
    </div>
  );
}
