"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TenantBadge from "@/components/auth/TenantBadge";
import { AppShell, Metric, PageWidth } from "@/components/ui/AppFrame";
import { buildTenantLoginPath } from "@/lib/admin-scope";
import { TenantPublicItem } from "@/types";

export default function SelectTenantPage() {
  const router = useRouter();
  const [publicTenants, setPublicTenants] = useState<TenantPublicItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [privateSlug, setPrivateSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tenants/public", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const tenants = Array.isArray(data) ? (data as TenantPublicItem[]) : [];
        setPublicTenants(tenants);
        setSelectedSlug(tenants[0]?.slug ?? "");
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  function continueToWorkspace(slug: string) {
    router.push(buildTenantLoginPath(slug));
  }

  function handlePublicSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlug) return;
    continueToWorkspace(selectedSlug);
  }

  async function handlePrivateSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedSlug = privateSlug.trim().toLowerCase();
    if (!trimmedSlug) return;

    setChecking(true);
    setError("");

    try {
      const response = await fetch("/api/tenants/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: trimmedSlug }),
      });

      if (!response.ok) {
        setError("Organization not found. Check the code and try again.");
        setChecking(false);
        return;
      }

      continueToWorkspace(trimmedSlug);
    } catch {
      setError("Something went wrong while checking the organization code.");
      setChecking(false);
    }
  }

  const selectedTenant =
    publicTenants.find((tenant) => tenant.slug === selectedSlug) ?? null;

  return (
    <AppShell variant="gallery">
      <PageWidth className="py-6 sm:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] xl:gap-8">
          <section className="space-y-6">
            <div className="surface-card rounded-[2rem] px-6 py-6 sm:px-8 sm:py-8">
              <p className="hero-kicker">Tenant Selection</p>
              <div className="mt-4 space-y-4">
                <h1 className="hero-title max-w-4xl text-[clamp(2rem,5vw,3.8rem)]">
                  Choose the workspace before you sign in.
                </h1>
                <p className="hero-subtitle">
                  Start with the tenant boundary. Once you choose a workspace,
                  the URL switches to the tenant slug and the login screen stays
                  scoped to that organization.
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Flow"
                  value="Tenant First"
                  subtext="Select the workspace before authentication."
                />
                <Metric
                  label="Routing"
                  value="/t/{slug}"
                  subtext="The slug becomes part of the URL before sign-in."
                />
                <Metric
                  label="Access"
                  value="Magic or Password"
                  subtext="Both sign-in methods stay available after selection."
                />
              </div>
            </div>

            {selectedTenant ? (
              <div className="surface-card-quiet rounded-[1.5rem] px-5 py-5">
                <div className="flex items-start gap-4">
                  <TenantBadge tenant={selectedTenant} />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-subtle)]">
                      Selected Workspace
                    </p>
                    <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                      {selectedTenant.name}
                    </p>
                    <p className="text-sm text-[color:var(--text-muted)]">
                      {selectedTenant.description ??
                        "Public workspace available for tenant-scoped sign-in."}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="surface-card rounded-[2rem] px-6 py-6 sm:px-7 sm:py-7">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="hero-kicker">Access Path</p>
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                  Continue to sign-in
                </h2>
                <p className="section-copy">
                  Pick a public workspace from the list, or enter a private
                  tenant code to continue.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--accent)] border-t-transparent" />
                </div>
              ) : (
                <div className="space-y-6">
                  {publicTenants.length > 0 ? (
                    <form onSubmit={handlePublicSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="public-tenant"
                          className="mb-2 block text-sm font-medium text-[color:var(--foreground)]"
                        >
                          Public workspace
                        </label>
                        <select
                          id="public-tenant"
                          value={selectedSlug}
                          onChange={(event) => setSelectedSlug(event.target.value)}
                          className="ops-select"
                        >
                          {publicTenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.slug}>
                              {tenant.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="submit"
                        disabled={!selectedSlug}
                        className="ops-button w-full justify-center"
                      >
                        Continue with Selected Workspace
                      </button>
                    </form>
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-[color:var(--border)] bg-slate-50/70 px-4 py-4 text-sm text-[color:var(--text-muted)]">
                      No public workspaces are currently listed. Use a private
                      tenant code below.
                    </div>
                  )}

                  <div className="border-t border-[color:var(--border)] pt-6">
                    <form onSubmit={handlePrivateSubmit} className="space-y-4">
                      <div>
                        <label
                          htmlFor="private-slug"
                          className="mb-2 block text-sm font-medium text-[color:var(--foreground)]"
                        >
                          Private tenant code
                        </label>
                        <input
                          id="private-slug"
                          type="text"
                          value={privateSlug}
                          onChange={(event) => setPrivateSlug(event.target.value)}
                          placeholder="e.g. aleut-program-team"
                          disabled={checking}
                          className="ops-input disabled:opacity-60"
                        />
                      </div>

                      {error ? (
                        <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
                          {error}
                        </div>
                      ) : null}

                      <button
                        type="submit"
                        disabled={checking || !privateSlug.trim()}
                        className="ops-button-secondary w-full justify-center"
                      >
                        {checking ? "Checking..." : "Continue with Private Tenant"}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              <div className="border-t border-[color:var(--border)] pt-5">
                <Link href="/login" className="ops-button-ghost">
                  Platform Administrator Sign-In
                </Link>
              </div>
            </div>
          </section>
        </div>
      </PageWidth>
    </AppShell>
  );
}
