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
    <section className="surface-card-quiet rounded-[1.35rem] border px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {activeTenant?.slug ? (
            <span className="chip ops-code">/t/{activeTenant.slug}</span>
          ) : null}
          <span className="chip chip-accent">
            Role
            <strong>{roleLabel}</strong>
          </span>
          <span className="chip">
            Albums
            <strong>{albumCount}</strong>
          </span>
          {availableTenants.length > 1 ? (
            <span className="chip">
              Workspaces
              <strong>{availableTenants.length}</strong>
            </span>
          ) : null}
        </div>

        <div className="min-w-0 xl:w-full xl:max-w-[22rem]">
          {availableTenants.length > 1 ? (
            <div className="space-y-2 xl:text-right">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="tenant-switcher"
                  className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
                >
                  Switch Workspace
                </label>
                {switching ? (
                  <span className="chip chip-accent">Switching...</span>
                ) : null}
              </div>

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
              Single-workspace session. No alternate workspace is available for
              this account.
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
