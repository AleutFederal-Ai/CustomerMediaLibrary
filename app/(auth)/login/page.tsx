"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HealthStatus from "@/components/ui/HealthStatus";
import CuiBanner from "@/components/ui/CuiBanner";
import { TenantPublicItem } from "@/types";

const PLATFORM_ADMIN_TENANT: TenantPublicItem = {
  id: "__platform_admin__",
  name: "Platform Administration",
  slug: "",
};

type TenantPickState = "loading" | "idle" | "checking";
type MagicState = "idle" | "submitting" | "sent" | "error";
type PasswordState = "idle" | "submitting" | "error";
type Tab = "magic" | "password";
type Step = "select-tenant" | "sign-in";

function TenantPill({ tenant }: { tenant: TenantPublicItem }) {
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

  async function handlePrivateSlug(e: FormEvent) {
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
    <div className="space-y-5">
      <p className="section-copy text-sm">
        Select your organization to continue into the secured media platform.
      </p>

      {state === "loading" ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : (
        <>
          {publicTenants.length > 0 ? (
            <div className="space-y-3">
              {publicTenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => onSelect(tenant)}
                  className="surface-card-soft group flex w-full items-center gap-4 rounded-[1.1rem] p-4 text-left"
                >
                  <TenantPill tenant={tenant} />
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
                </button>
              ))}
            </div>
          ) : null}

          {publicTenants.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="ops-divider" />
              <span className="text-xs uppercase tracking-[0.22em] text-[var(--text-subtle)]">
                or
              </span>
              <div className="ops-divider" />
            </div>
          ) : null}

          {!showPrivateInput ? (
            <button
              type="button"
              onClick={() => setShowPrivateInput(true)}
              className="ops-button-secondary w-full justify-center"
            >
              Enter a Private Organization Code
            </button>
          ) : (
            <form onSubmit={handlePrivateSlug} className="space-y-3">
              <label
                htmlFor="private-slug"
                className="block text-sm font-medium text-white/86"
              >
                Organization code
              </label>
              <input
                id="private-slug"
                type="text"
                value={privateSlug}
                onChange={(e) => setPrivateSlug(e.target.value)}
                placeholder="e.g. my-organization"
                disabled={state === "checking"}
                className="ops-input disabled:opacity-50"
              />
              {slugError ? (
                <p className="text-sm text-[#ffb7b7]">{slugError}</p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={state === "checking" || !privateSlug.trim()}
                  className="ops-button flex-1"
                >
                  {state === "checking" ? "Checking..." : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrivateInput(false);
                    setPrivateSlug("");
                    setSlugError("");
                    setState("idle");
                  }}
                  className="ops-button-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="border-t border-[rgba(140,172,197,0.14)] pt-5 text-center">
            <button
              type="button"
              onClick={onPlatformAdmin}
              className="ops-button-ghost mx-auto text-xs uppercase tracking-[0.18em]"
            >
              Platform Administrator Sign-In
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MagicLinkForm({
  tenant,
  hasError,
}: {
  tenant: TenantPublicItem;
  hasError: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<MagicState>("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState("submitting");
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tenantSlug: tenant.slug,
          ...(tenant.id === PLATFORM_ADMIN_TENANT.id && {
            mode: "platform-admin",
          }),
        }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[rgba(88,215,176,0.22)] bg-[rgba(88,215,176,0.16)]">
          <svg
            className="h-7 w-7 text-[var(--success)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-xl font-semibold tracking-[-0.03em] text-white">
          Check your email
        </h3>
        <p className="text-sm leading-7 text-[var(--text-muted)]">
          If your email is authorized, you will receive a login link shortly.
          The link expires in 10 minutes.
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setState("idle");
          }}
          className="ops-button-ghost mx-auto mt-6"
        >
          Use a Different Email
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="mb-5 text-sm leading-7 text-[var(--text-muted)]">
        Enter your authorized email address to receive a one-time login link.
      </p>

      {hasError && state === "idle" ? (
        <div className="ops-danger-panel mb-4 rounded-[1rem] px-4 py-3 text-sm">
          That login link is invalid or has expired. Please request a new one.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="ml-email"
            className="mb-1.5 block text-sm font-medium text-white/86"
          >
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
            className="ops-input disabled:opacity-50"
          />
        </div>

        {state === "error" ? (
          <p className="text-sm text-[#ffb7b7]">
            Something went wrong. Please try again.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={state === "submitting" || !email}
          className="ops-button w-full justify-center"
        >
          {state === "submitting" ? "Sending..." : "Send Login Link"}
        </button>
      </form>
    </>
  );
}

function PasswordForm({ tenant }: { tenant: TenantPublicItem }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<PasswordState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
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
          ...(tenant.id === PLATFORM_ADMIN_TENANT.id && {
            mode: "platform-admin",
          }),
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
      <p className="mb-5 text-sm leading-7 text-[var(--text-muted)]">
        Sign in with your email address and password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="pw-email"
            className="mb-1.5 block text-sm font-medium text-white/86"
          >
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
            className="ops-input disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="pw-password"
            className="mb-1.5 block text-sm font-medium text-white/86"
          >
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
            className="ops-input disabled:opacity-50"
          />
        </div>

        {state === "error" && errorMsg ? (
          <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
            {errorMsg}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={state === "submitting" || !email || !password}
          className="ops-button w-full justify-center"
        >
          {state === "submitting" ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "invalid";
  const tenantSlugParam = searchParams.get("tenant") ?? "";

  const [step, setStep] = useState<Step>(
    tenantSlugParam ? "sign-in" : "select-tenant"
  );
  const [selectedTenant, setSelectedTenant] = useState<TenantPublicItem | null>(
    null
  );
  const [tab, setTab] = useState<Tab>("magic");

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
    setTab("password");
    setStep("sign-in");
  }

  const isPlatformAdmin = selectedTenant?.id === PLATFORM_ADMIN_TENANT.id;

  return (
    <>
      <CuiBanner />

      <div className="app-shell flex min-h-[calc(100vh-44px)] items-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="border-b border-[rgba(140,172,197,0.14)] bg-[linear-gradient(135deg,rgba(23,58,87,0.98),rgba(10,33,49,0.98))] px-5 py-5 sm:px-8 sm:py-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/8">
                  <svg
                    className="h-5 w-5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="hero-kicker text-[rgba(214,245,255,0.82)] before:bg-[linear-gradient(135deg,#dff7ff,rgba(214,245,255,0.2))]">
                    Access Gateway
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
                    myMedia Platform
                  </h1>
                  <p className="mt-1 text-sm text-[rgba(214,245,255,0.74)]">
                    Tenant-aware authentication and controlled media access.
                  </p>
                </div>
              </div>
            </div>

            {step === "sign-in" && selectedTenant ? (
              <div className="border-b border-[rgba(140,172,197,0.14)] bg-[rgba(7,18,28,0.58)] px-5 py-4 sm:px-8">
                <div className="flex items-center gap-3">
                  {isPlatformAdmin ? (
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[rgba(241,197,108,0.24)] bg-[rgba(241,197,108,0.14)]">
                      <svg
                        className="h-4 w-4 text-[var(--warning)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                    </div>
                  ) : (
                    <TenantPill tenant={selectedTenant} />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      Active Tenant Context
                    </p>
                    <span
                      className={`block truncate text-sm font-medium ${
                        isPlatformAdmin ? "text-[var(--warning)]" : "text-white"
                      }`}
                    >
                      {selectedTenant.name}
                    </span>
                  </div>

                  {!tenantSlugParam ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStep("select-tenant");
                        setSelectedTenant(null);
                      }}
                      className="ops-button-ghost !w-auto text-xs uppercase tracking-[0.18em]"
                    >
                      Change
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === "sign-in" ? (
              <div className="flex border-b border-[rgba(140,172,197,0.14)] bg-[rgba(5,16,25,0.7)]">
                <button
                  type="button"
                  onClick={() => setTab("magic")}
                  className={`flex-1 px-4 py-4 text-sm font-semibold uppercase tracking-[0.08em] ${
                    tab === "magic"
                      ? "bg-[rgba(105,211,255,0.12)] text-white"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  Email Link
                </button>
                <button
                  type="button"
                  onClick={() => setTab("password")}
                  className={`flex-1 px-4 py-4 text-sm font-semibold uppercase tracking-[0.08em] ${
                    tab === "password"
                      ? "bg-[rgba(105,211,255,0.12)] text-white"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  Password
                </button>
              </div>
            ) : null}

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              {step === "select-tenant" ? (
                <>
                  <p className="hero-kicker">Tenant Selection</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                    Choose your organization
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                    Public organizations are listed below. If your tenant is
                    private, use its organization code to continue.
                  </p>
                  <div className="mt-6">
                    <TenantSelector
                      onSelect={handleTenantSelected}
                      onPlatformAdmin={handlePlatformAdmin}
                    />
                  </div>
                </>
              ) : null}

              {step === "sign-in" && selectedTenant ? (
                tab === "magic" ? (
                  <MagicLinkForm tenant={selectedTenant} hasError={hasError} />
                ) : (
                  <PasswordForm tenant={selectedTenant} />
                )
              ) : null}

              {step === "sign-in" && !selectedTenant ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                </div>
              ) : null}
            </div>
          </section>

          <div className="mx-auto w-full max-w-3xl">
            <HealthStatus />
          </div>
        </div>
      </div>
    </>
  );
}
