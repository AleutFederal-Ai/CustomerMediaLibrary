import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { TenantPublicItem, AuditLogRecord } from "@/types";
import AdminTenantSection from "./AdminTenantSection";
import {
  AppShell,
  BackLink,
  HeroSection,
  Metric,
  PageWidth,
  SectionHeader,
  TopBar,
} from "@/components/ui/AppFrame";

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
  const activeTenantId = headerStore.get("x-active-tenant-id") ?? "";
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const proto = headerStore.get("x-forwarded-proto") ?? "http";

  if (!email) redirect("/login");

  const [isPlatformAdmin, isTenantAdm] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
  ]);

  if (!isPlatformAdmin && !isTenantAdm) redirect("/");

  const [activeTenant, stats] = await Promise.all([
    fetch(`${proto}://${host}/api/tenants/current`, {
      headers: { cookie: headerStore.get("cookie") ?? "" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<TenantPublicItem>) : null))
      .catch(() => null),
    isPlatformAdmin
      ? fetch(`${proto}://${host}/api/admin/stats`, {
          headers: { cookie: headerStore.get("cookie") ?? "" },
          cache: "no-store",
        })
          .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href="/">Return to Gallery</BackLink>
          <div>
            <p className="hero-kicker">Administrative Control Plane</p>
            <p className="text-sm text-[var(--text-muted)]">
              {email}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {isPlatformAdmin ? (
            <span className="chip chip-accent">Platform Administrator</span>
          ) : null}
          {isTenantAdm && !isPlatformAdmin ? (
            <span className="chip">Tenant Administrator</span>
          ) : null}
        </div>
      </TopBar>

      <PageWidth className="space-y-8 py-8 sm:space-y-10 sm:py-10">
        <HeroSection
          eyebrow="Operations Dashboard"
          title="Secure media administration at tenant and platform scale."
          description="Monitor tenant posture, review recent activity, and move directly into the administrative workflows that keep media delivery governed and auditable."
          meta={
            <>
              <span className="chip chip-accent">
                Active Scope
                <strong>{activeTenant?.name ?? "Platform"}</strong>
              </span>
              <span className="chip">
                Role
                <strong>{isPlatformAdmin ? "Platform" : "Tenant"}</strong>
              </span>
            </>
          }
          actions={
            <>
              <Link href="/admin/upload" className="ops-button">
                Upload Media
              </Link>
              <Link href="/admin/albums" className="ops-button-secondary">
                Manage Albums
              </Link>
            </>
          }
        />

        {stats ? (
          <section className="space-y-5">
            <SectionHeader
              eyebrow="Platform Overview"
              title="Operational visibility across the environment"
              description="Cross-tenant totals provide a quick signal on platform growth, active usage, and current storage posture."
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <Metric
                label="Tenants"
                value={stats.totals.activeTenants}
                subtext={`${stats.totals.tenants} total organizations`}
              />
              <Metric label="Users" value={stats.totals.users} />
              <Metric label="Media Files" value={stats.totals.media} />
              <Metric
                label="Storage"
                value={
                  stats.totals.storageMB >= 1024
                    ? `${(stats.totals.storageMB / 1024).toFixed(1)} GB`
                    : `${stats.totals.storageMB} MB`
                }
              />
              <Metric
                label="Active Sessions"
                value={stats.totals.activeSessions}
              />
              <Metric label="Albums" value={stats.totals.albums} />
            </div>
          </section>
        ) : null}

        {isPlatformAdmin ? (
          <section className="space-y-5">
            <SectionHeader
              eyebrow="Platform Administration"
              title="High-impact control surfaces"
              description="These workflows affect the full environment, including user control, tenant creation, and global audit visibility."
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  href: "/admin/tenants",
                  label: "Organizations",
                  description:
                    "Create, activate, and configure tenant identity and branding.",
                },
                {
                  href: "/admin/users",
                  label: "User Control",
                  description:
                    "Review access posture, set passwords, block accounts, and promote platform admins.",
                },
              {
                href: "/admin/audit-logs",
                label: "Audit Timeline",
                description:
                  "Inspect cross-tenant activity, exports, and administrative events.",
              },
              {
                href: "/admin/api-health",
                label: "API Health",
                description:
                  "Run dependency checks, smoke probes, and manual API validation.",
              },
            ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="surface-card-soft rounded-[1.3rem] p-5"
                >
                  <p className="hero-kicker">{item.label}</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
                    {item.label}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {isPlatformAdmin && stats && stats.recentActivity.length > 0 ? (
          <section className="space-y-5">
            <SectionHeader
              eyebrow="Recent Activity"
              title="Latest control-plane events"
              description="Recent platform actions provide immediate situational awareness for operators working across tenants."
              actions={
                <Link href="/admin/audit-logs" className="ops-button-secondary">
                  View Full Audit Log
                </Link>
              }
            />

            <div className="surface-card rounded-[1.5rem] overflow-hidden p-5 sm:p-6">
              <div className="overflow-x-auto">
                <table className="ops-table text-sm">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentActivity.map((log) => (
                      <tr key={log.id}>
                        <td className="ops-muted whitespace-nowrap">
                          {formatRelativeTime(log.timestamp)}
                        </td>
                        <td className="text-white">{log.userEmail}</td>
                        <td>
                          <span className="ops-badge ops-badge-info">
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="ops-code ops-muted max-w-[220px] truncate">
                          {log.ipAddress}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        <AdminTenantSection
          activeTenant={activeTenant}
          tenantSummaries={stats?.tenantSummaries ?? []}
        />
      </PageWidth>
    </AppShell>
  );
}
