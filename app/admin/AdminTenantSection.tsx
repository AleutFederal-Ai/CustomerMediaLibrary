"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TenantPublicItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";
import { buildAdminTenantPath } from "@/lib/admin-scope";
import { SectionHeader } from "@/components/ui/AppFrame";

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
}

interface Props {
  activeTenant: TenantPublicItem | null;
  tenantSummaries: TenantSummary[];
}

const TENANT_LINKS = [
  {
    href: "/admin/upload",
    label: "Upload Media",
    description: "Add photos and video to approved albums.",
  },
  {
    href: "/admin/albums",
    label: "Manage Albums",
    description: "Create, order, rename, and retire media collections.",
  },
  {
    href: "/admin/members",
    label: "Manage Members",
    description: "Grant viewer, contributor, and admin permissions.",
  },
  {
    href: "/admin/domains",
    label: "Manage Domains",
    description: "Control email domain auto-access for this tenant.",
  },
  {
    href: "/admin/api-health",
    label: "API Health",
    description: "Run tenant-scoped smoke tests and endpoint verification.",
  },
];

function TenantIdentity({
  name,
  logoUrl,
  brandColor,
}: {
  name: string;
  logoUrl?: string;
  brandColor?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-10 w-10 rounded-2xl border border-white/10 bg-slate-950/40 object-contain p-2"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-white"
      style={{ backgroundColor: brandColor ?? "#1e3a5f" }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function AdminTenantSection({
  activeTenant: initialTenant,
  tenantSummaries,
}: Props) {
  const router = useRouter();
  const [activeTenant, setActiveTenant] = useState(initialTenant);
  const [switching, setSwitching] = useState<string | null>(null);
  const [fallbackTenants, setFallbackTenants] = useState<TenantPublicItem[]>([]);

  useEffect(() => {
    if (tenantSummaries.length === 0) {
      apiFetch("/api/tenants")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setFallbackTenants(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [tenantSummaries.length]);

  const pickerTenants: Array<{
    id: string;
    name: string;
    slug: string;
    brandColor?: string;
    logoUrl?: string;
    isActive: boolean;
    albumCount?: number;
    mediaCount?: number;
    memberCount?: number;
  }> =
    tenantSummaries.length > 0
      ? tenantSummaries
      : fallbackTenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          brandColor: tenant.brandColor,
          logoUrl: tenant.logoUrl,
          isActive: true,
        }));

  async function switchToTenant(tenantId: string) {
    setSwitching(tenantId);
    try {
      const res = await apiFetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      if (res.ok) {
        const match =
          tenantSummaries.find((t) => t.id === tenantId) ??
          fallbackTenants.find((t) => t.id === tenantId);
        if (match) {
          setActiveTenant({
            id: match.id,
            name: match.name,
            slug: match.slug,
            brandColor: match.brandColor,
            logoUrl: match.logoUrl,
          });
          router.replace(buildAdminTenantPath("/admin", match.slug));
          return;
        }
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to switch tenant.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setSwitching(null);
    }
  }

  const activeTenants = pickerTenants.filter((tenant) => tenant.isActive);
  const activeTenantSlug = activeTenant?.slug;

  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Tenant Administration"
        title="Operate within the current tenant boundary"
        description="Switch organizations, review current tenant posture, and move directly into scoped content and access workflows."
      />

      <div className="surface-card rounded-[1.25rem] p-4 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.82fr)]">
          <div className="space-y-4">
            {activeTenant ? (
              <div className="surface-card-soft rounded-[1.1rem] p-4">
                <div className="flex items-center gap-3">
                  <TenantIdentity
                    name={activeTenant.name}
                    logoUrl={activeTenant.logoUrl}
                    brandColor={activeTenant.brandColor}
                  />
                  <div className="min-w-0">
                    <p className="hero-kicker">Selected Tenant</p>
                    <h3 className="mt-1.5 truncate text-lg font-semibold tracking-[-0.03em] text-white">
                      {activeTenant.name}
                    </h3>
                    <p className="ops-code mt-1 text-sm text-[var(--text-muted)]">
                      /t/{activeTenant.slug}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ops-warning-panel rounded-[1.2rem] px-4 py-4 text-sm">
                Select a tenant from the control on the right to manage its
                content, access, and upload workflows.
              </div>
            )}

            {activeTenant ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {TENANT_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={buildAdminTenantPath(item.href, activeTenantSlug)}
                    className="surface-card-soft rounded-[1.05rem] p-4"
                  >
                    <p className="hero-kicker">{item.label}</p>
                    <h3 className="mt-2 text-base font-semibold tracking-[-0.03em] text-white">
                      {item.label}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 opacity-50">
                {TENANT_LINKS.map((item) => (
                  <div
                    key={item.href}
                    className="surface-card-soft rounded-[1.05rem] p-4"
                  >
                    <p className="hero-kicker">{item.label}</p>
                    <h3 className="mt-2 text-base font-semibold tracking-[-0.03em] text-white">
                      {item.label}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card-soft rounded-[1.1rem] p-4">
            <p className="hero-kicker">Tenant Selector</p>
            <h3 className="mt-2.5 text-base font-semibold tracking-[-0.03em] text-white sm:text-lg">
              Change active tenant
            </h3>
            <p className="mt-2.5 text-sm leading-6 text-[var(--text-muted)]">
              Changing the active tenant updates the administrative scope and the
              gallery routes associated with your current session.
            </p>

            {activeTenants.length > 0 ? (
              <div className="mt-4 space-y-3">
                <select
                  aria-label="Select active tenant"
                  value={activeTenant?.id ?? ""}
                  onChange={(e) => {
                    if (e.target.value) switchToTenant(e.target.value);
                  }}
                  disabled={switching !== null}
                  className="ops-select disabled:opacity-60"
                >
                  {!activeTenant ? (
                    <option value="" disabled>
                      Select a tenant...
                    </option>
                  ) : null}
                  {activeTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>

                {switching ? (
                  <span className="chip chip-accent">Switching tenant...</span>
                ) : null}

                <div className="space-y-2.5">
                  {activeTenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      className={`rounded-[0.95rem] border px-3.5 py-3 ${
                        tenant.id === activeTenant?.id
                          ? "border-[rgba(105,211,255,0.28)] bg-[rgba(105,211,255,0.08)]"
                          : "border-[rgba(140,172,197,0.12)] bg-[rgba(7,18,28,0.48)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <TenantIdentity
                          name={tenant.name}
                          logoUrl={tenant.logoUrl}
                          brandColor={tenant.brandColor}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {tenant.name}
                          </p>
                          <p className="ops-code mt-1 text-xs text-[var(--text-muted)]">
                            /t/{tenant.slug}
                          </p>
                        </div>
                      </div>
                      {(tenant.albumCount != null ||
                        tenant.mediaCount != null ||
                        tenant.memberCount != null) && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {tenant.albumCount != null ? (
                            <span className="chip">
                              Albums
                              <strong>{tenant.albumCount}</strong>
                            </span>
                          ) : null}
                          {tenant.mediaCount != null ? (
                            <span className="chip">
                              Media
                              <strong>{tenant.mediaCount}</strong>
                            </span>
                          ) : null}
                          {tenant.memberCount != null ? (
                            <span className="chip">
                              Members
                              <strong>{tenant.memberCount}</strong>
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <Link href="/admin/tenants" className="ops-button">
                  Create Organization
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
