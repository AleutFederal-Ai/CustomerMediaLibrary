"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";

export interface AccountTenantOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  email: string;
  activeScopeLabel?: string;
  activeTenantId?: string;
  tenantOptions?: AccountTenantOption[];
  canSwitchTenant?: boolean;
  adminHref?: string;
}

function getInitials(email: string): string {
  const localPart = email.split("@")[0] ?? "U";
  const tokens = localPart
    .split(/[.\-_ ]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase();
}

export default function AccountMenu({
  email,
  activeScopeLabel,
  activeTenantId,
  tenantOptions = [],
  canSwitchTenant = false,
  adminHref,
}: Props) {
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(activeTenantId ?? "");
  const [switchError, setSwitchError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const initials = useMemo(() => getInitials(email), [email]);

  useEffect(() => {
    setSelectedTenantId(activeTenantId ?? "");
  }, [activeTenantId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleTenantSwitch(tenantId: string) {
    if (!tenantId || tenantId === activeTenantId) {
      return;
    }

    setSelectedTenantId(tenantId);
    setSwitching(true);
    setSwitchError("");

    try {
      const response = await apiFetch("/api/sessions/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setSwitchError(data.error ?? "Unable to switch tenant.");
        setSelectedTenantId(activeTenantId ?? "");
        return;
      }

      const targetTenant = tenantOptions.find((tenant) => tenant.id === tenantId);
      if (targetTenant?.slug) {
        setOpen(false);
        router.push(`/t/${targetTenant.slug}`);
        return;
      }

      router.refresh();
    } catch {
      setSwitchError("Network error while changing tenant.");
      setSelectedTenantId(activeTenantId ?? "");
    } finally {
      setSwitching(false);
    }
  }

  const showTenantSwitcher = canSwitchTenant && tenantOptions.length > 1;

  return (
    <div ref={containerRef} className="relative z-[70]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-3 rounded-full border border-[rgba(148,163,184,0.28)] bg-white px-3 py-2 text-left shadow-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {initials}
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
            Account
          </p>
          <p className="max-w-[12rem] truncate text-sm font-medium text-slate-900">
            {email}
          </p>
        </div>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[80] mt-3 w-[20rem] rounded-[1.2rem] border border-[rgba(148,163,184,0.2)] bg-white p-4 shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-[rgba(148,163,184,0.16)] pb-3">
            <p className="text-sm font-semibold text-slate-950">{email}</p>
            <p className="mt-1 text-xs text-slate-500">
              {activeScopeLabel
                ? `Active scope: ${activeScopeLabel}`
                : "Manage your profile, media, and workspace context."}
            </p>
          </div>

          <div className="mt-3 space-y-1">
            <Link
              href="/profile"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
            <Link
              href="/profile#owned-content"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              My Media
            </Link>
            {adminHref ? (
              <Link
                href={adminHref}
                className="block rounded-[0.9rem] px-3 py-2 text-sm text-slate-900 hover:bg-slate-100"
                onClick={() => setOpen(false)}
              >
                Admin Console
              </Link>
            ) : null}
          </div>

          {showTenantSwitcher ? (
            <div className="mt-3 border-t border-[rgba(148,163,184,0.16)] pt-3">
              <label
                htmlFor="account-tenant-switcher"
                className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
              >
                Tenant Switcher
              </label>
              <select
                id="account-tenant-switcher"
                value={selectedTenantId}
                onChange={(event) => {
                  void handleTenantSwitch(event.target.value);
                }}
                disabled={switching}
                className="ops-select disabled:opacity-60"
              >
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              {switchError ? (
                <p className="mt-2 text-xs text-red-700">{switchError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 border-t border-[rgba(148,163,184,0.16)] pt-3">
            <Link
              href="/api/auth/signout"
              className="block rounded-[0.9rem] px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              onClick={() => setOpen(false)}
            >
              Sign Out
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
