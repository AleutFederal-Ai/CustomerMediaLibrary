"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TenantBadge from "@/components/auth/TenantBadge";
import HealthStatus from "@/components/ui/HealthStatus";
import { AppShell, PageWidth } from "@/components/ui/AppFrame";
import { buildTenantLoginPath } from "@/lib/admin-scope";
import { TenantPublicItem } from "@/types";

export default function SelectTenantPage() {
  const router = useRouter();
  const [publicTenants, setPublicTenants] = useState<TenantPublicItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [publicSearch, setPublicSearch] = useState("");
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
        setPublicSearch("");
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
  const normalizedSearch = publicSearch.trim().toLowerCase();
  const filteredPublicTenants =
    normalizedSearch.length === 0
      ? publicTenants
      : publicTenants.filter((tenant) =>
          [tenant.name, tenant.slug, tenant.description]
            .filter(Boolean)
            .some((value) => value?.toLowerCase().includes(normalizedSearch))
        );

  return (
    <AppShell variant="gallery">
      <PageWidth className="py-6 sm:py-8">
        <section className="surface-card-quiet mb-6 rounded-[1.2rem] border border-[color:var(--border)] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--text-subtle)]">
                Aleut Federal
              </p>
              <p className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                myMedia
              </p>
            </div>
            <span className="chip chip-accent">
              Platform
              <strong>Tenant Access</strong>
            </span>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] xl:gap-8">
          <section className="space-y-6">
            <div className="surface-card rounded-[2rem] px-6 py-6 sm:px-8 sm:py-8">
              <p className="hero-kicker">Tenant Selection</p>
              <div className="mt-4 space-y-4">
                <h1 className="hero-title max-w-4xl text-[clamp(2rem,5vw,3.8rem)]">
                  Select tenant, then sign in.
                </h1>
                <p className="hero-subtitle">
                  Start with your organization and continue directly to login.
                  This page stays focused on tenant selection only.
                </p>
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
                        <p className="mb-2 text-sm font-medium text-[color:var(--foreground)]">
                          Public workspace
                        </p>
                        <input
                          id="public-tenant-search"
                          type="text"
                          value={publicSearch}
                          onChange={(event) => {
                            setPublicSearch(event.target.value);
                            setSelectedSlug("");
                          }}
                          placeholder="Search by tenant name or slug"
                          className="ops-input"
                        />
                        <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                          Search and select a public tenant below.
                        </p>

                        <div className="space-y-2">
                          {filteredPublicTenants.map((tenant) => {
                            const isSelected = selectedSlug === tenant.slug;
                            return (
                              <button
                                key={tenant.id}
                                type="button"
                                onClick={() => {
                                  setSelectedSlug(tenant.slug);
                                  setPublicSearch(tenant.name);
                                }}
                                className={`w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                                  isSelected
                                    ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_20px_rgba(15,23,42,0.15)]"
                                    : "border-[color:var(--border)] bg-white/80 text-[color:var(--foreground)] hover:border-slate-400"
                                }`}
                              >
                                <p className="text-sm font-semibold">{tenant.name}</p>
                                {tenant.description ? (
                                  <p
                                    className={`mt-1 text-xs ${
                                      isSelected
                                        ? "text-slate-100"
                                        : "text-[color:var(--text-muted)]"
                                    }`}
                                  >
                                    {tenant.description}
                                  </p>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                        {filteredPublicTenants.length === 0 ? (
                          <div className="mt-2 rounded-[1rem] border border-dashed border-[color:var(--border)] bg-slate-50/70 px-3 py-3 text-xs text-[color:var(--text-muted)]">
                            No matching public tenant. Use the private tenant code
                            field below if your workspace is not listed.
                          </div>
                        ) : null}
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

        <div className="mt-6">
          <HealthStatus />
        </div>
      </PageWidth>
    </AppShell>
  );
}
