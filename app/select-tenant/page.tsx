"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TenantPublicItem } from "@/types";

/**
 * /select-tenant
 *
 * Post-authentication tenant picker. Shown when a user has access to multiple
 * tenants and no preferred tenant was pre-selected at login time.
 *
 * Fetches the user's accessible tenants from /api/tenants (authenticated),
 * lets them choose one, then patches the session via /api/sessions/current.
 */
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
        // If only one tenant, auto-select it
        if (Array.isArray(data) && data.length === 1) {
          selectTenant(data[0].id);
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

  async function selectTenant(tenantId: string) {
    setSwitching(tenantId);
    setError("");
    try {
      const res = await fetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to select organization.");
        setSwitching(null);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-900 mb-4">
            <svg
              className="w-8 h-8 text-blue-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">Select Organization</h1>
          <p className="text-slate-400 mt-1 text-sm">
            You have access to multiple organizations. Choose one to continue.
          </p>
        </div>

        {/* Tenant list */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {tenants.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400 text-sm">
                Your account is not associated with any organization.
                Contact your administrator.
              </p>
              <a
                href="/api/auth/signout"
                className="mt-4 inline-block text-blue-400 hover:text-blue-300 text-sm underline"
              >
                Sign out
              </a>
            </div>
          ) : (
            <ul className="divide-y divide-slate-700">
              {tenants.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectTenant(t.id)}
                    disabled={switching !== null}
                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-slate-700 transition-colors text-left group disabled:opacity-60"
                  >
                    {t.logoUrl ? (
                      <img
                        src={t.logoUrl}
                        alt={t.name}
                        className="w-9 h-9 rounded object-contain flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                        style={{ backgroundColor: t.brandColor ?? "#1e3a5f" }}
                      >
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-white font-medium group-hover:text-blue-300 transition-colors truncate">
                        {t.name}
                      </div>
                      {t.description && (
                        <div className="text-slate-400 text-xs truncate">{t.description}</div>
                      )}
                    </div>
                    {switching === t.id ? (
                      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <svg
                        className="w-4 h-4 text-slate-500 group-hover:text-slate-300 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
        )}

        <div className="mt-6 text-center">
          <a
            href="/api/auth/signout"
            className="text-slate-500 hover:text-slate-400 text-sm"
          >
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}
