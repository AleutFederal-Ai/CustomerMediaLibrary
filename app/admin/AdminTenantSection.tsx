"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TenantPublicItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

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

interface Props {
  activeTenant: TenantPublicItem | null;
  tenantSummaries: TenantSummary[];
}

const TENANT_LINKS = [
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
];

export default function AdminTenantSection({
  activeTenant: initialTenant,
  tenantSummaries,
}: Props) {
  const router = useRouter();
  const [activeTenant, setActiveTenant] = useState(initialTenant);
  const [switching, setSwitching] = useState<string | null>(null);

  // If tenantSummaries is empty (stats didn't load), fetch user's tenants
  const [fallbackTenants, setFallbackTenants] = useState<TenantPublicItem[]>(
    []
  );
  useEffect(() => {
    if (tenantSummaries.length === 0) {
      apiFetch("/api/tenants")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) =>
          setFallbackTenants(Array.isArray(data) ? data : [])
        )
        .catch(() => {});
    }
  }, [tenantSummaries.length]);

  // Build the list of tenants to show in the picker
  // Prefer tenantSummaries (has stats), fall back to user's tenants
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
      : fallbackTenants.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          brandColor: t.brandColor,
          logoUrl: t.logoUrl,
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

  const brandColor = activeTenant?.brandColor ?? "#1e3a5f";
  const activeTenants = pickerTenants.filter((t) => t.isActive);

  return (
    <section className="space-y-4">
      {/* ─── Divider ──────────────────────────────────────────────── */}
      <div className="border-t border-slate-700 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider">
            Tenant Administration
          </h2>

          {/* ─── Tenant Dropdown Selector ──────────────────────────── */}
          {activeTenants.length > 0 ? (
            <div className="flex items-center gap-3">
              {switching && (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              {activeTenant && (
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: brandColor }}
                >
                  {activeTenant.name.charAt(0).toUpperCase()}
                </div>
              )}
              <select
                value={activeTenant?.id ?? ""}
                onChange={(e) => {
                  if (e.target.value) switchToTenant(e.target.value);
                }}
                disabled={switching !== null}
                className="bg-slate-800 border border-slate-600 text-white text-sm rounded-md px-3 py-1.5 pr-8 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 cursor-pointer appearance-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M3 5l3 3 3-3'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                {!activeTenant && (
                  <option value="" disabled>
                    Select a tenant...
                  </option>
                )}
                {activeTenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Link
              href="/admin/tenants"
              className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
            >
              Create organization &rarr;
            </Link>
          )}
        </div>
      </div>

      {/* ─── No tenant selected hint ─────────────────────────────── */}
      {!activeTenant && activeTenants.length > 0 && (
        <div className="p-3 bg-amber-900/30 border border-amber-700 rounded-lg flex items-center gap-2">
          <span className="text-amber-400 text-sm flex-shrink-0">&#9888;</span>
          <p className="text-amber-200 text-sm">
            Select a tenant from the dropdown above to manage its content.
          </p>
        </div>
      )}

      {/* ─── Tenant Admin Links ───────────────────────────────────── */}
      {activeTenant ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TENANT_LINKS.map((s) => (
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 opacity-40 pointer-events-none select-none">
          {TENANT_LINKS.map((s) => (
            <div
              key={s.href}
              className="block p-4 bg-slate-800 border border-slate-700 rounded-lg"
            >
              <h3 className="text-white font-medium text-sm">{s.label}</h3>
              <p className="text-slate-400 text-xs mt-1">{s.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
