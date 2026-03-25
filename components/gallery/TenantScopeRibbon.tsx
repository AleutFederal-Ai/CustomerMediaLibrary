"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TenantPublicItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  activeTenant: TenantPublicItem | null;
  tenants: TenantPublicItem[];
  roleLabel: string;
  albumCount: number;
}

function TenantBadge({ tenant }: { tenant: TenantPublicItem | null }) {
  if (tenant?.logoUrl) {
    return (
      <img
        src={tenant.logoUrl}
        alt={tenant.name}
        className="h-12 w-12 rounded-2xl border border-[color:var(--border)] bg-white object-contain p-2"
      />
    );
  }

  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
      style={{ backgroundColor: tenant?.brandColor ?? "#1e3a5f" }}
    >
      {(tenant?.name ?? "M").charAt(0).toUpperCase()}
    </div>
  );
}

export default function TenantScopeRibbon({
  activeTenant,
  tenants,
  roleLabel,
  albumCount,
}: Props) {
  const router = useRouter();
  const [switching, setSwitching] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState(activeTenant?.id ?? "");
  const [error, setError] = useState("");
  const availableTenants =
    tenants.length > 0 ? tenants : activeTenant ? [activeTenant] : [];

  useEffect(() => {
    setSelectedTenantId(activeTenant?.id ?? "");
  }, [activeTenant?.id]);

  async function switchTenant(tenantId: string) {
    if (!tenantId || tenantId === activeTenant?.id) return;

    setSelectedTenantId(tenantId);
    setSwitching(tenantId);
    setError("");

    try {
      const response = await apiFetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Failed to change tenant.");
        setSelectedTenantId(activeTenant?.id ?? "");
        return;
      }

      const targetTenant = availableTenants.find((tenant) => tenant.id === tenantId);
      if (targetTenant?.slug) {
        router.push(`/t/${targetTenant.slug}`);
        return;
      }

      router.refresh();
    } catch {
      setError("Network error while changing tenant.");
      setSelectedTenantId(activeTenant?.id ?? "");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <section className="surface-card rounded-[1.5rem] px-4 py-4 sm:px-5 sm:py-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(260px,320px)] xl:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <TenantBadge tenant={activeTenant} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[color:var(--text-muted)]">
              Active tenant
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)] sm:text-xl">
                {activeTenant?.name ?? "Platform"}
              </h1>
              {activeTenant?.slug ? (
                <span className="chip ops-code">/t/{activeTenant.slug}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Switch tenant context here when you need to move between
              organizations.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-center">
          <span className="chip chip-accent">
            Scope
            <strong>{roleLabel}</strong>
          </span>
          <span className="chip">
            Collections
            <strong>{albumCount}</strong>
          </span>
          {availableTenants.length > 1 ? (
            <span className="chip">
              Tenants
              <strong>{availableTenants.length}</strong>
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          {availableTenants.length > 1 ? (
            <div className="space-y-2">
              <label
                htmlFor="tenant-switcher"
                className="block text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
              >
                Switch Workspace
              </label>
              <select
                id="tenant-switcher"
                value={selectedTenantId}
                onChange={(event) => {
                  const nextTenantId = event.target.value;
                  if (nextTenantId) switchTenant(nextTenantId);
                }}
                disabled={switching !== null}
                className="ops-select disabled:opacity-60"
              >
                {availableTenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[color:var(--text-muted)]">
                Change tenant context without returning to sign-in.
              </p>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--text-muted)] xl:text-right">
              Single-tenant session. No alternate tenant is available for this
              account.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <div className="ops-danger-panel mt-4 rounded-[1rem] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
    </section>
  );
}
