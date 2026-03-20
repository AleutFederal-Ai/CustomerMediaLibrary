"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TenantPublicItem } from "@/types";

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
  const [showPicker, setShowPicker] = useState(false);

  async function switchToTenant(tenantId: string) {
    setSwitching(tenantId);
    try {
      const res = await fetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        // Update local state to reflect the switch immediately
        const summary = tenantSummaries.find((t) => t.id === tenantId);
        if (summary) {
          setActiveTenant({
            id: summary.id,
            name: summary.name,
            slug: summary.slug,
            brandColor: summary.brandColor,
            logoUrl: summary.logoUrl,
          });
        }
        setShowPicker(false);
        router.refresh();
      } else {
        alert("Failed to switch tenant.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setSwitching(null);
    }
  }

  const brandColor = activeTenant?.brandColor ?? "#1e3a5f";

  return (
    <section className="space-y-4">
      {/* ─── Divider ──────────────────────────────────────────────── */}
      <div className="border-t border-slate-700 pt-6">
        <h2 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-4">
          Tenant Administration
        </h2>
      </div>

      {/* ─── Tenant Context Banner ────────────────────────────────── */}
      {activeTenant ? (
        <div
          className="flex items-center justify-between p-4 rounded-lg border-l-4"
          style={{
            borderLeftColor: brandColor,
            backgroundColor: "rgb(30 41 59)", // bg-slate-800
          }}
        >
          <div className="flex items-center gap-3">
            {activeTenant.logoUrl ? (
              <img
                src={activeTenant.logoUrl}
                alt={activeTenant.name}
                className="w-8 h-8 rounded object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {activeTenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-white font-medium">
                {activeTenant.name}
              </p>
              <p className="text-slate-400 text-xs">
                Managing this organization's content, members, and domains
              </p>
            </div>
          </div>
          {tenantSummaries.length > 1 && (
            <button
              type="button"
              onClick={() => setShowPicker(!showPicker)}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors flex-shrink-0"
            >
              {showPicker ? "Cancel" : "Switch Tenant"}
            </button>
          )}
        </div>
      ) : (
        <div className="p-4 bg-amber-900/30 border border-amber-700 rounded-lg flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0 mt-0.5">
            &#9888;
          </span>
          <div>
            <p className="text-amber-200 font-medium text-sm">
              No tenant selected
            </p>
            <p className="text-amber-300/70 text-xs mt-0.5">
              Select a tenant below to manage its albums, members, and
              domains. Tenant-specific actions are disabled until one is
              selected.
            </p>
          </div>
        </div>
      )}

      {/* ─── Tenant Picker (inline) ───────────────────────────────── */}
      {(showPicker || !activeTenant) && tenantSummaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tenantSummaries
            .filter((t) => t.isActive)
            .map((t) => {
              const isActive = activeTenant?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (!isActive) switchToTenant(t.id);
                  }}
                  disabled={switching !== null}
                  className={`p-4 rounded-lg border text-left transition-all disabled:opacity-60 ${
                    isActive
                      ? "border-blue-500 bg-blue-900/20 ring-1 ring-blue-500/50"
                      : "border-slate-700 bg-slate-800 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
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
                    {isActive && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 border border-blue-700 rounded ml-auto flex-shrink-0">
                        Active
                      </span>
                    )}
                    {switching === t.id && (
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin ml-auto flex-shrink-0" />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-xs">
                    <div>
                      <p className="text-white font-medium">{t.albumCount}</p>
                      <p className="text-slate-500">Albums</p>
                    </div>
                    <div>
                      <p className="text-white font-medium">{t.mediaCount}</p>
                      <p className="text-slate-500">Media</p>
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {t.memberCount}
                      </p>
                      <p className="text-slate-500">Members</p>
                    </div>
                  </div>
                </button>
              );
            })}
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
