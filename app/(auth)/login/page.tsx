"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HealthStatus from "@/components/ui/HealthStatus";
import { TenantPublicItem } from "@/types";

// Sentinel used when signing in as a platform admin (no org context)
const PLATFORM_ADMIN_TENANT: TenantPublicItem = {
  id: "__platform_admin__",
  name: "Platform Administration",
  slug: "",
};

// ─── Tenant selection step ─────────────────────────────────────────────────

type TenantPickState = "loading" | "idle" | "checking" | "error";

function TenantSelector({
  onSelect,
  onPlatformAdmin,
}: {
  onSelect: (tenant: TenantPublicItem) => void;
  onPlatformAdmin: () => void;
}) {
  const [publicTenants, setPublicTenants] = useState<TenantPublicItem[]>([]);
  const [state, setState] = useState<TenantPickState>("loading");
  const [privateSlug, setPrivateSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [showPrivateInput, setShowPrivateInput] = useState(false);

  useEffect(() => {
    fetch("/api/tenants/public")
      .then((r) => r.json())
      .then((data) => {
        setPublicTenants(Array.isArray(data) ? data : []);
        setState("idle");
      })
      .catch(() => setState("idle"));
  }, []);

  async function handlePrivateSlug(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    if (!privateSlug.trim()) return;
    setState("checking");
    setSlugError("");
    try {
      const res = await fetch("/api/tenants/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: privateSlug.trim().toLowerCase() }),
      });
      if (res.ok) {
        const tenant: TenantPublicItem = await res.json();
        onSelect(tenant);
      } else {
        setSlugError("Organization not found. Check the code and try again.");
        setState("idle");
      }
    } catch {
      setSlugError("Something went wrong. Please try again.");
      setState("idle");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm mb-4">
        Select your organization to continue.
      </p>

      {state === "loading" ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Public tenant cards */}
          {publicTenants.length > 0 && (
            <div className="space-y-2">
              {publicTenants.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  className="w-full flex items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-lg transition-colors text-left group"
                >
                  {t.logoUrl ? (
                    <img
                      src={t.logoUrl}
                      alt={t.name}
                      className="w-8 h-8 rounded object-contain flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm"
                      style={{ backgroundColor: t.brandColor ?? "#1e3a5f" }}
                    >
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-white font-medium group-hover:text-blue-300 transition-colors truncate">
                      {t.name}
                    </div>
                    {t.description && (
                      <div className="text-slate-400 text-xs truncate">{t.description}</div>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-slate-500 group-hover:text-slate-300 ml-auto flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Divider when both public and private */}
          {publicTenants.length > 0 && (
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-600" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-slate-800 px-2 text-slate-500">or</span>
              </div>
            </div>
          )}

          {/* Private org code */}
          {!showPrivateInput ? (
            <button
              type="button"
              onClick={() => setShowPrivateInput(true)}
              className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-white text-sm rounded-lg transition-colors"
            >
              Enter a private organization code
            </button>
          ) : (
            <form onSubmit={handlePrivateSlug} className="space-y-2">
              <label htmlFor="private-slug" className="block text-sm font-medium text-slate-300">
                Organization code
              </label>
              <input
                id="private-slug"
                type="text"
                value={privateSlug}
                onChange={(e) => setPrivateSlug(e.target.value)}
                placeholder="e.g. my-organization"
                disabled={state === "checking"}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              {slugError && <p className="text-red-400 text-sm">{slugError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={state === "checking" || !privateSlug.trim()}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                >
                  {state === "checking" ? "Checking…" : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPrivateInput(false); setPrivateSlug(""); setSlugError(""); setState("idle"); }}
                  className="py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {/* Platform admin sign-in link */}
          <div className="mt-6 pt-4 border-t border-slate-700 text-center">
            <button
              type="button"
              onClick={onPlatformAdmin}
              className="text-slate-500 hover:text-slate-400 text-xs transition-colors"
            >
              Platform administrator sign-in
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Magic Link form ───────────────────────────────────────────────────────

type MagicState = "idle" | "submitting" | "sent" | "error";

function MagicLinkForm({
  tenant,
  hasError,
}: {
  tenant: TenantPublicItem;
  hasError: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<MagicState>("idle");

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tenantSlug: tenant.slug,
          ...(tenant.id === PLATFORM_ADMIN_TENANT.id && { mode: "platform-admin" }),
        }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-white font-medium text-lg mb-2">Check your email</h2>
        <p className="text-slate-400 text-sm">
          If your email is authorized, you will receive a login link shortly. The
          link expires in 10 minutes.
        </p>
        <button
          type="button"
          onClick={() => { setEmail(""); setState("idle"); }}
          className="mt-6 text-blue-400 hover:text-blue-300 text-sm underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="text-slate-400 text-sm mb-6">
        Enter your authorized email address to receive a one-time login link.
      </p>

      {hasError && state === "idle" && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded text-red-300 text-sm">
          That login link is invalid or has expired. Please request a new one.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ml-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="ml-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "submitting"}
            placeholder="you@example.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {state === "error" && (
          <p className="text-red-400 text-sm">Something went wrong. Please try again.</p>
        )}

        <button
          type="submit"
          disabled={state === "submitting" || !email}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          {state === "submitting" ? "Sending…" : "Send login link"}
        </button>
      </form>
    </>
  );
}

// ─── Password form ─────────────────────────────────────────────────────────

type PasswordState = "idle" | "submitting" | "error";

function PasswordForm({ tenant }: { tenant: TenantPublicItem }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<PasswordState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    setState("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          tenantSlug: tenant.slug,
          ...(tenant.id === PLATFORM_ADMIN_TENANT.id && { mode: "platform-admin" }),
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        router.push((data as { redirectTo?: string }).redirectTo ?? "/");
        return;
      }

      const data = await res.json().catch(() => ({}));
      setErrorMsg(
        res.status === 401
          ? "Invalid email or password."
          : (data as { error?: string }).error ?? "Something went wrong."
      );
      setState("error");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }

  return (
    <>
      <p className="text-slate-400 text-sm mb-6">
        Sign in with your email address and password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="pw-email" className="block text-sm font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="pw-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "submitting"}
            placeholder="you@example.com"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="pw-password" className="block text-sm font-medium text-slate-300 mb-1">
            Password
          </label>
          <input
            id="pw-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={state === "submitting"}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {state === "error" && errorMsg && (
          <p className="text-red-400 text-sm">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={state === "submitting" || !email || !password}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          {state === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}

// ─── Login page ────────────────────────────────────────────────────────────

type Tab = "magic" | "password";
type Step = "select-tenant" | "sign-in";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "invalid";
  const tenantSlugParam = searchParams.get("tenant") ?? "";

  const [step, setStep] = useState<Step>(tenantSlugParam ? "sign-in" : "select-tenant");
  const [selectedTenant, setSelectedTenant] = useState<TenantPublicItem | null>(null);
  const [tab, setTab] = useState<Tab>("magic");

  // If a slug was passed via URL, resolve it immediately
  const resolveSlugFromUrl = useCallback(async (slug: string) => {
    try {
      const res = await fetch("/api/tenants/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) {
        const tenant: TenantPublicItem = await res.json();
        setSelectedTenant(tenant);
        setStep("sign-in");
      } else {
        // Slug invalid — fall back to selection
        setStep("select-tenant");
      }
    } catch {
      setStep("select-tenant");
    }
  }, []);

  useEffect(() => {
    if (tenantSlugParam) {
      resolveSlugFromUrl(tenantSlugParam);
    }
  }, [tenantSlugParam, resolveSlugFromUrl]);

  function handleTenantSelected(tenant: TenantPublicItem) {
    setSelectedTenant(tenant);
    setStep("sign-in");
  }

  function handlePlatformAdmin() {
    setSelectedTenant(PLATFORM_ADMIN_TENANT);
    setStep("sign-in");
  }

  const isPlatformAdmin = selectedTenant?.id === PLATFORM_ADMIN_TENANT.id;

  const cardTitle =
    step === "select-tenant"
      ? "Select your organization"
      : isPlatformAdmin
      ? tab === "magic" ? "Platform administrator — email link" : "Platform administrator — password"
      : tab === "magic"
      ? "Sign in with email link"
      : "Sign in with password";

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="w-full max-w-md mb-8 text-center">
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
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white">Secure Media Gallery</h1>
        <p className="text-slate-400 mt-1 text-sm">Controlled Unclassified Information</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-slate-800 rounded-lg shadow-xl border border-slate-700">

        {/* Selected tenant / platform-admin badge (sign-in step) */}
        {step === "sign-in" && selectedTenant && (
          <div
            className="flex items-center gap-3 px-6 py-3 border-b border-slate-700 rounded-t-lg"
            style={!isPlatformAdmin ? { borderTopColor: selectedTenant.brandColor ?? undefined } : undefined}
          >
            {isPlatformAdmin ? (
              <div className="w-6 h-6 rounded bg-amber-900/60 flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            ) : selectedTenant.logoUrl ? (
              <img src={selectedTenant.logoUrl} alt={selectedTenant.name} className="w-6 h-6 rounded object-contain" />
            ) : (
              <div
                className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: selectedTenant.brandColor ?? "#1e3a5f" }}
              >
                {selectedTenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className={`text-sm font-medium truncate ${isPlatformAdmin ? "text-amber-300" : "text-white"}`}>
              {selectedTenant.name}
            </span>
            {!tenantSlugParam && (
              <button
                type="button"
                onClick={() => { setStep("select-tenant"); setSelectedTenant(null); }}
                className="ml-auto text-slate-400 hover:text-slate-200 text-xs underline flex-shrink-0"
              >
                Change
              </button>
            )}
          </div>
        )}

        {/* Tabs (sign-in step only) */}
        {step === "sign-in" && (
          <div className="flex border-b border-slate-700">
            <button
              type="button"
              onClick={() => setTab("magic")}
              className={`flex-1 py-3 text-sm font-medium transition-colors focus:outline-none ${
                tab === "magic"
                  ? "bg-slate-800 text-white border-b-2 border-blue-500"
                  : "bg-slate-900/40 text-slate-400 hover:text-slate-300"
              }`}
            >
              Magic Link
            </button>
            <button
              type="button"
              onClick={() => setTab("password")}
              className={`flex-1 py-3 text-sm font-medium transition-colors focus:outline-none ${
                tab === "password"
                  ? "bg-slate-800 text-white border-b-2 border-blue-500"
                  : "bg-slate-900/40 text-slate-400 hover:text-slate-300"
              }`}
            >
              Password
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-8">
          <h2 className="text-white font-medium text-lg mb-1">{cardTitle}</h2>

          {step === "select-tenant" && (
            <TenantSelector onSelect={handleTenantSelected} onPlatformAdmin={handlePlatformAdmin} />
          )}

          {step === "sign-in" && selectedTenant && (
            <>
              {tab === "magic" ? (
                <MagicLinkForm tenant={selectedTenant} hasError={hasError} />
              ) : (
                <PasswordForm tenant={selectedTenant} />
              )}
            </>
          )}

          {/* Resolving slug from URL param — show spinner */}
          {step === "sign-in" && !selectedTenant && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      <HealthStatus />

      <p className="mt-6 text-slate-600 text-xs text-center max-w-sm">
        Access to this system is restricted to authorized personnel only.
        Unauthorized access is prohibited and may be subject to criminal prosecution.
      </p>
    </div>
  );
}
