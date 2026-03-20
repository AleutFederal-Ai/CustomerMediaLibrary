import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { TenantPublicItem, AuditLogRecord } from "@/types";

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
  const tenantIds = (headerStore.get("x-tenant-ids") ?? "")
    .split(",")
    .filter(Boolean);

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

  const brandColor = activeTenant?.brandColor ?? "#1e3a5f";

  // Tenant-scoped admin links
  const tenantSections = [
    {
      href: "/admin/upload",
      label: "Upload Media",
      description: "Add photos and videos to albums",
    },
    {
      href: "/admin/albums",
      label: "Manage Albums",
      description: "Create, edit, reorder, and delete albums",
    },
    {
      href: "/admin/members",
      label: "Manage Members",
      description: "Assign viewer, contributor, or admin roles",
    },
    {
      href: "/admin/domains",
      label: "Manage Domains",
      description: "Control which email domains auto-grant access",
    },
    {
      href: "/admin/audit-logs",
      label: "Audit Logs",
      description: "Review all system activity",
    },
  ];

  // Platform-admin links
  const superAdminSections = [
    {
      href: "/admin/tenants",
      label: "Organizations",
      description: "Create and manage tenant organizations",
    },
    {
      href: "/admin/users",
      label: "Manage Users",
      description: "View users, block, set passwords, promote admins",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Tenant brand bar */}
      {activeTenant?.brandColor && (
        <div
          className="h-1"
          style={{ backgroundColor: activeTenant.brandColor }}
        />
      )}

      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            &larr; Gallery
          </Link>
          <div className="flex items-center gap-2">
            {activeTenant?.logoUrl ? (
              <img
                src={activeTenant.logoUrl}
                alt={activeTenant.name}
                className="w-5 h-5 rounded object-contain"
              />
            ) : (
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {(activeTenant?.name ?? "A").charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-white font-semibold">
              {activeTenant
                ? `${activeTenant.name} \u2014 Admin`
                : "Admin"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {tenantIds.length > 1 && (
            <Link
              href="/select-tenant"
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Switch org
            </Link>
          )}
          <span className="text-slate-400 text-sm">{email}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* ─── KPI Row ──────────────────────────────────────────────── */}
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

        {/* ─── Recent Activity ──────────────────────────────────────── */}
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

        {/* ─── Per-Tenant Summaries ─────────────────────────────────── */}
        {stats && stats.tenantSummaries.length > 0 && (
          <section>
            <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
              Organizations ({stats.tenantSummaries.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.tenantSummaries.map((t) => (
                <div
                  key={t.id}
                  className={`p-4 bg-slate-800 border rounded-lg ${t.isActive ? "border-slate-700" : "border-slate-700 opacity-50"}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    {t.logoUrl ? (
                      <img
                        src={t.logoUrl}
                        alt={t.name}
                        className="w-6 h-6 rounded object-contain"
                      />
                    ) : (
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: t.brandColor ?? "#1e3a5f",
                        }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-white font-medium text-sm truncate">
                      {t.name}
                    </span>
                    {!t.isActive && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-400 border border-red-800 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-white text-lg font-semibold">
                        {t.albumCount}
                      </p>
                      <p className="text-slate-500 text-xs">Albums</p>
                    </div>
                    <div>
                      <p className="text-white text-lg font-semibold">
                        {t.mediaCount}
                      </p>
                      <p className="text-slate-500 text-xs">Media</p>
                    </div>
                    <div>
                      <p className="text-white text-lg font-semibold">
                        {t.memberCount}
                      </p>
                      <p className="text-slate-500 text-xs">Members</p>
                    </div>
                  </div>
                  {t.storageMB > 0 && (
                    <p className="text-slate-500 text-xs mt-2 text-center">
                      {t.storageMB >= 1024
                        ? `${(t.storageMB / 1024).toFixed(1)} GB`
                        : `${t.storageMB} MB`}{" "}
                      storage
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Tenant Administration ────────────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
            {activeTenant ? activeTenant.name : "Organization"} Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tenantSections.map((s) => (
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

        {/* ─── Platform Administration ──────────────────────────────── */}
        <section>
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
            Platform Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {superAdminSections.map((s) => (
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
      </main>
    </div>
  );
}
