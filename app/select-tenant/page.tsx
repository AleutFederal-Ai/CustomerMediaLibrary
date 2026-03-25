"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TenantPublicItem } from "@/types";

function TenantBadge({ tenant }: { tenant: TenantPublicItem }) {
  if (tenant.logoUrl) {
    return (
      <img
        src={tenant.logoUrl}
        alt={tenant.name}
        className="h-10 w-10 rounded-2xl border border-white/10 bg-slate-950/40 object-contain p-2"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-white"
      style={{ backgroundColor: tenant.brandColor ?? "#1e3a5f" }}
    >
      {tenant.name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function SelectTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantPublicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setTenants(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length === 1) {
          selectTenant(data[0]);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Failed to load your organizations. Please try again.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectTenant(tenant: TenantPublicItem) {
    setSwitching(tenant.id);
    setError("");
    try {
      const res = await fetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      if (res.ok) {
        router.push(`/t/${tenant.slug}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Failed to select organization."
        );
        setSwitching(null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSwitching(null);
    }
  }

  return (
    <div className="app-shell flex min-h-[calc(100vh-88px)] items-center justify-center px-4 py-10">
      <div className="surface-card w-full max-w-3xl rounded-[2rem] p-6 sm:p-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <p className="hero-kicker">Tenant Switch</p>
              <h1 className="hero-title max-w-3xl text-[clamp(1.8rem,4vw,2.8rem)]">
                Select the organization context for this session.
              </h1>
              <p className="hero-subtitle max-w-2xl">
                Your account has access to multiple organizations. Choose the
                tenant boundary you want to operate in before entering the
                media workspace.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="metric-card">
                <p className="metric-label">Organizations</p>
                <p className="metric-value">{tenants.length}</p>
                <p className="metric-subtext">Available to this identity</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Routing</p>
                <p className="metric-value">Tenant Scoped</p>
                <p className="metric-subtext">Session target is updated before load</p>
              </div>
              <div className="metric-card">
                <p className="metric-label">Controls</p>
                <p className="metric-value">Audited</p>
                <p className="metric-subtext">Tenant switching is recorded in session history</p>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              {tenants.length === 0 ? (
                <div className="ops-empty">
                  <p className="text-lg font-semibold text-white">
                    No organizations are currently assigned to this account.
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-sm">
                    Contact a tenant or platform administrator if you expected
                    access.
                  </p>
                  <a href="/api/auth/signout" className="ops-button-secondary mt-6 inline-flex">
                    Sign Out
                  </a>
                </div>
              ) : (
                tenants.map((tenant) => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => selectTenant(tenant)}
                    disabled={switching !== null}
                    className="surface-card-soft group flex w-full items-center gap-4 rounded-[1.2rem] p-4 text-left disabled:opacity-60"
                  >
                    <TenantBadge tenant={tenant} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold tracking-[-0.02em] text-white">
                        {tenant.name}
                      </div>
                      {tenant.description ? (
                        <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                          {tenant.description}
                        </div>
                      ) : null}
                    </div>
                    {switching === tenant.id ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                    ) : (
                      <svg
                        className="h-4 w-4 flex-shrink-0 text-[var(--text-muted)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>

            {error ? (
              <p className="mt-4 text-sm text-[#ffb7b7]">{error}</p>
            ) : null}

            <div className="mt-6">
              <a href="/api/auth/signout" className="ops-button-ghost">
                Sign Out
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
