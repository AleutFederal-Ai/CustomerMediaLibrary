"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import HealthStatus from "@/components/ui/HealthStatus";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";
import TenantBadge from "@/components/auth/TenantBadge";
import { TenantPublicItem } from "@/types";

export const PLATFORM_ADMIN_TENANT: TenantPublicItem = {
  id: "__platform_admin__",
  name: "Platform Administration",
  slug: "",
};

type MagicState = "idle" | "submitting" | "sent" | "error";
type PasswordState = "idle" | "submitting" | "error";
type Tab = "magic" | "password";

function MagicLinkForm({
  tenant,
  hasError,
}: {
  tenant: TenantPublicItem;
  hasError: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<MagicState>("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setState("submitting");

    try {
      const response = await fetch("/api/auth/request-link", {
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

      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="space-y-4 rounded-[1.25rem] border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-5 w-5"
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
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
            Check your email
          </h3>
          <p className="leading-6 text-[color:var(--text-muted)]">
            If your email is authorized, you will receive a one-time login link
            shortly. The link expires in 10 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEmail("");
            setState("idle");
          }}
          className="ops-button-secondary"
        >
          Use a Different Email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="section-copy">
        Enter your authorized email address to receive a one-time sign-in link.
      </p>

      {hasError && state === "idle" ? (
        <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
          That login link is invalid or has expired. Please request a new one.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="ml-email"
            className="mb-2 block text-sm font-medium text-[color:var(--foreground)]"
          >
            Email address
          </label>
          <input
            id="ml-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={state === "submitting"}
            placeholder="you@example.com"
            className="ops-input disabled:opacity-50"
          />
        </div>

        {state === "error" ? (
          <p className="text-sm text-red-600">
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
    </div>
  );
}

function PasswordForm({ tenant }: { tenant: TenantPublicItem }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<PasswordState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setState("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/password", {
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

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        router.push((data as { redirectTo?: string }).redirectTo ?? "/");
        return;
      }

      const data = await response.json().catch(() => ({}));
      setErrorMessage(
        response.status === 401
          ? "Invalid email or password."
          : (data as { error?: string }).error ?? "Something went wrong."
      );
      setState("error");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setState("error");
    }
  }

  return (
    <div className="space-y-5">
      <p className="section-copy">
        Sign in with your authorized email address and password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="pw-email"
            className="mb-2 block text-sm font-medium text-[color:var(--foreground)]"
          >
            Email address
          </label>
          <input
            id="pw-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={state === "submitting"}
            placeholder="you@example.com"
            className="ops-input disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="pw-password"
            className="mb-2 block text-sm font-medium text-[color:var(--foreground)]"
          >
            Password
          </label>
          <input
            id="pw-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={state === "submitting"}
            className="ops-input disabled:opacity-50"
          />
        </div>

        {state === "error" && errorMessage ? (
          <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
            {errorMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={state === "submitting" || !email || !password}
          className="ops-button w-full justify-center"
        >
          {state === "submitting" ? "Signing In..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function TenantLoginWorkspace({
  tenant,
  hasError = false,
  changeHref = "/select-tenant",
  heading,
  description,
  helpLabel,
}: {
  tenant: TenantPublicItem;
  hasError?: boolean;
  changeHref?: string;
  heading?: string;
  description?: string;
  helpLabel?: string;
}) {
  const isPlatformAdmin = tenant.id === PLATFORM_ADMIN_TENANT.id;
  const [tab, setTab] = useState<Tab>(isPlatformAdmin ? "password" : "magic");

  const pageTitle =
    heading ??
    (isPlatformAdmin
      ? "Platform administrator sign-in"
      : `Sign in to ${tenant.name}`);
  const pageDescription =
    description ??
    (isPlatformAdmin
      ? "Use the administrative access path when you need the control plane, user management, or health portals."
      : "Continue into the tenant-scoped workspace with a one-time magic link or your password.");
  const helperCopy =
    helpLabel ??
    (isPlatformAdmin
      ? "Need a tenant workspace instead?"
      : "Need a different organization?");

  return (
    <AppShell variant="gallery">
      <PageWidth className="py-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] xl:gap-8">
          <div className="space-y-6">
            <section className="surface-card rounded-[2rem] px-6 py-6 sm:px-8 sm:py-8">
              <p className="hero-kicker">Secure Access</p>
              <div className="mt-4 space-y-4">
                <h1 className="hero-title max-w-3xl text-[clamp(2rem,5vw,3.8rem)]">
                  {pageTitle}
                </h1>
                <p className="hero-subtitle">{pageDescription}</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {tenant.slug ? (
                  <span className="chip ops-code">/t/{tenant.slug}</span>
                ) : (
                  <span className="chip chip-accent">
                    Scope
                    <strong>Platform Admin</strong>
                  </span>
                )}
                <span className="chip">
                  Methods
                  <strong>Magic Link or Password</strong>
                </span>
                <span className="chip">
                  Access
                  <strong>Tenant Scoped</strong>
                </span>
              </div>

              <div className="mt-8 rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 px-5 py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {isPlatformAdmin ? (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                        PF
                      </div>
                    ) : (
                      <TenantBadge tenant={tenant} />
                    )}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-subtle)]">
                        Workspace Context
                      </p>
                      <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                        {tenant.name}
                      </p>
                      <p className="text-sm text-[color:var(--text-muted)]">
                        {isPlatformAdmin
                          ? "Administrative control-plane access."
                          : "Authentication for this workspace stays tied to the selected tenant slug."}
                      </p>
                    </div>
                  </div>

                  <Link href={changeHref} className="ops-button-secondary">
                    Change Workspace
                  </Link>
                </div>
              </div>
            </section>

            <HealthStatus />
          </div>

          <section className="surface-card overflow-hidden rounded-[2rem]">
            <div className="border-b border-[color:var(--border)] px-6 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="hero-kicker">Authentication</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    Choose how you want to sign in
                  </h2>
                </div>
                <Link href={changeHref} className="ops-button-ghost">
                  {helperCopy}
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-b border-[color:var(--border)] bg-slate-50/80 px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={() => setTab("magic")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-semibold ${
                  tab === "magic"
                    ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                    : "bg-white text-[color:var(--text-muted)]"
                }`}
              >
                Magic Link
              </button>
              <button
                type="button"
                onClick={() => setTab("password")}
                className={`rounded-[1rem] px-4 py-3 text-sm font-semibold ${
                  tab === "password"
                    ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.14)]"
                    : "bg-white text-[color:var(--text-muted)]"
                }`}
              >
                Password
              </button>
            </div>

            <div className="px-6 py-6 sm:px-7 sm:py-7">
              {tab === "magic" ? (
                <MagicLinkForm tenant={tenant} hasError={hasError} />
              ) : (
                <PasswordForm tenant={tenant} />
              )}
            </div>
          </section>
        </div>
      </PageWidth>
    </AppShell>
  );
}
