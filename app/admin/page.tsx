import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getPlatformStats } from "@/lib/admin/stats";
import { getAdminTenantPageContext } from "@/lib/auth/admin-tenant-page";
import AccountMenu from "@/components/account/AccountMenu";
import { buildAdminTenantPath, buildGalleryWorkspacePath } from "@/lib/admin-scope";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { getActiveTenantPublicItem } from "@/lib/tenant-data";
import AdminTenantSection from "./AdminTenantSection";
import {
  AppShell,
  BackLink,
  PageWidth,
  SectionHeader,
  TopBar,
} from "@/components/ui/AppFrame";

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

function CompactMetric({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="surface-card-soft rounded-[1.1rem] px-4 py-3 sm:px-5">
      <p className="metric-label">{label}</p>
      <p className="mt-2 text-[1.45rem] font-semibold leading-none tracking-[-0.04em] text-white">
        {value}
      </p>
      {subtext ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--text-subtle)]">
          {subtext}
        </p>
      ) : null}
    </div>
  );
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const { tenant: requestedTenantSlug } = await searchParams;
  const { email, activeTenantId } =
    await getAdminTenantPageContext({
      currentPath: "/admin",
      requestedTenantSlug,
    });

  const [isPlatformAdmin, isTenantAdm] = await Promise.all([
    canAccessAdmin(email),
    activeTenantId ? isTenantAdmin(email, activeTenantId) : Promise.resolve(false),
  ]);

  if (!isPlatformAdmin && !isTenantAdm) redirect("/");

  const [activeTenant, stats] = await Promise.all([
    getActiveTenantPublicItem(activeTenantId),
    isPlatformAdmin ? getPlatformStats().catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <AppShell>
      <TopBar accentColor={activeTenant?.brandColor}>
        <div className="flex items-center gap-3">
          <BackLink href={buildGalleryWorkspacePath(activeTenant?.slug)}>
            Return to Gallery
          </BackLink>
          <div>
            <p className="hero-kicker">Administrative Control Plane</p>
            <p className="text-sm text-[var(--text-muted)]">
              {email}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {isPlatformAdmin ? (
            <span className="chip chip-accent">Platform Administrator</span>
          ) : null}
          {isTenantAdm && !isPlatformAdmin ? (
            <span className="chip">Tenant Administrator</span>
          ) : null}
          <AccountMenu
            email={email}
            activeScopeLabel={activeTenant?.name ?? "Platform"}
          />
        </div>
      </TopBar>

      <PageWidth className="space-y-6 py-6 sm:space-y-8 sm:py-8">
        <section className="surface-card-soft rounded-[1.2rem] px-4 py-4 sm:px-5 sm:py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="hero-kicker">Administrative Scope</p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-[-0.03em] text-white sm:text-xl">
                  {activeTenant?.name ?? "Platform"}
                </h1>
                {activeTenant?.slug ? (
                  <span className="chip ops-code">/t/{activeTenant.slug}</span>
                ) : null}
                <span className="chip chip-accent">
                  Role
                  <strong>{isPlatformAdmin ? "Platform" : "Tenant"}</strong>
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Use the controls below to manage tenant content, identity, and
                audit workflows.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link
                href={buildAdminTenantPath("/admin/upload", activeTenant?.slug)}
                className="ops-button"
              >
                Upload Media
              </Link>
              <Link
                href={buildAdminTenantPath("/admin/albums", activeTenant?.slug)}
                className="ops-button-secondary"
              >
                Manage Albums
              </Link>
            </div>
          </div>
        </section>

        {stats ? (
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Platform Overview"
              title="Operational visibility across the environment"
              description="Cross-tenant totals provide a quick signal on platform growth, active usage, and current storage posture."
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <CompactMetric
                label="Tenants"
                value={stats.totals.activeTenants}
                subtext={`${stats.totals.tenants} total organizations`}
              />
              <CompactMetric label="Users" value={stats.totals.users} />
              <CompactMetric label="Media Files" value={stats.totals.media} />
              <CompactMetric
                label="Storage"
                value={
                  stats.totals.storageMB >= 1024
                    ? `${(stats.totals.storageMB / 1024).toFixed(1)} GB`
                    : `${stats.totals.storageMB} MB`
                }
              />
              <CompactMetric
                label="Active Sessions"
                value={stats.totals.activeSessions}
              />
              <CompactMetric label="Albums" value={stats.totals.albums} />
            </div>
          </section>
        ) : null}

        {isPlatformAdmin ? (
          <section className="space-y-4">
            <SectionHeader
              eyebrow="Platform Administration"
              title="High-impact control surfaces"
              description="These workflows affect the full environment, including user control, tenant creation, and global audit visibility."
            />
            <div className="grid gap-3 lg:grid-cols-4">
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
                  className="surface-card-soft rounded-[1.15rem] p-4"
                >
                  <p className="hero-kicker">{item.label}</p>
                  <h3 className="mt-2.5 text-lg font-semibold tracking-[-0.03em] text-white">
                    {item.label}
                  </h3>
                  <p className="mt-2.5 text-sm leading-6 text-[var(--text-muted)]">
                    {item.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {isPlatformAdmin && stats && stats.recentActivity.length > 0 ? (
          <section className="space-y-4">
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

            <div className="surface-card rounded-[1.25rem] overflow-hidden p-4 sm:p-5">
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
