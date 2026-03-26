"use client";

import React, { useEffect, useState } from "react";
import AccountMenu from "@/components/account/AccountMenu";
import { apiFetch } from "@/lib/api-fetch";
import { TenantListItem } from "@/types";

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,62}[a-z0-9]$/;

function CreateTenantForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1e3a5f");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function autoSlug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 64);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!SLUG_RE.test(slug)) {
      setError("Slug must be lowercase alphanumeric with hyphens (min 2 chars).");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await apiFetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          isPublic,
          ...(description.trim() && { description: description.trim() }),
          ...(logoUrl.trim() && { logoUrl: logoUrl.trim() }),
          ...(brandColor && { brandColor }),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "Failed to create tenant.");
        return;
      }

      setName("");
      setSlug("");
      setIsPublic(false);
      setDescription("");
      setLogoUrl("");
      setBrandColor("#1e3a5f");
      onCreated();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-6"
    >
      <h3 className="text-base font-medium text-white">New Organization</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slug) {
                setSlug(autoSlug(event.target.value));
              }
            }}
            placeholder="Acme Corp"
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Slug * <span className="font-normal text-slate-500">(URL identifier)</span>
          </label>
          <input
            type="text"
            required
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="acme-corp"
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-slate-500">Direct URL: /t/{slug || "..."}</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-300">
          Description <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short description shown on the login page"
          className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Logo URL <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://.../logo.png"
            className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-300">
            Brand color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-slate-600 bg-slate-700"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(event) => setBrandColor(event.target.value)}
              className="flex-1 rounded border border-slate-600 bg-slate-700 px-3 py-2 font-mono text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="is-public"
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="is-public" className="cursor-pointer text-sm text-slate-300">
          <span className="font-medium">Public</span>
          <span className="ml-1 text-slate-500">
            - appears in the organization selection list on the login page
          </span>
        </label>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={saving || !name || !slug}
        className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800 disabled:opacity-50"
      >
        {saving ? "Creating..." : "Create Organization"}
      </button>
    </form>
  );
}

function TenantRow({
  tenant,
  onUpdate,
  onDeactivate,
}: {
  tenant: TenantListItem;
  onUpdate: (id: string, changes: Partial<TenantListItem>) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tenant.name);
  const [isPublic, setIsPublic] = useState(tenant.isPublic);
  const [description, setDescription] = useState(tenant.description ?? "");
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? "");
  const [brandColor, setBrandColor] = useState(tenant.brandColor ?? "#1e3a5f");
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [showAdminAssign, setShowAdminAssign] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [assigningAdmin, setAssigningAdmin] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminSuccess, setAdminSuccess] = useState("");

  async function save() {
    setSaving(true);
    await onUpdate(tenant.id, { name, isPublic, description, logoUrl, brandColor });
    setSaving(false);
    setEditing(false);
  }

  async function deactivate() {
    if (!confirm(`Deactivate "${tenant.name}"? Users will lose access immediately.`)) {
      return;
    }
    setDeactivating(true);
    await onDeactivate(tenant.id);
  }

  async function assignTenantAdmin(event: React.FormEvent) {
    event.preventDefault();

    if (!adminEmail.trim()) {
      setAdminError("Enter an email address.");
      return;
    }

    setAssigningAdmin(true);
    setAdminError("");
    setAdminSuccess("");

    try {
      const response = await apiFetch(`/api/admin/members?tenantId=${tenant.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: adminEmail.trim(),
          role: "admin",
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setAdminError(data.error ?? "Failed to assign tenant admin.");
        return;
      }

      setAdminSuccess(`Assigned ${adminEmail.trim()} as tenant admin.`);
      setAdminEmail("");
      setShowAdminAssign(false);
    } catch {
      setAdminError("Network error while assigning tenant admin.");
    } finally {
      setAssigningAdmin(false);
    }
  }

  const brandSwatch = brandColor || "#1e3a5f";

  return (
    <div
      className={`rounded-lg border bg-slate-800 p-5 ${
        tenant.isActive ? "border-slate-700" : "border-slate-700 opacity-50"
      }`}
    >
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Slug <span className="text-slate-600">(read-only)</span>
              </label>
              <input
                type="text"
                value={tenant.slug}
                disabled
                className="w-full cursor-not-allowed rounded border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Logo URL
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Brand color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border border-slate-600 bg-slate-700"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1.5 font-mono text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id={`pub-${tenant.id}`}
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-blue-600"
            />
            <label
              htmlFor={`pub-${tenant.id}`}
              className="cursor-pointer text-sm text-slate-300"
            >
              Public (shown on login page)
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded bg-slate-700 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                className="mt-0.5 h-10 w-10 flex-shrink-0 rounded object-contain"
              />
            ) : (
              <div
                className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded text-sm font-bold text-white"
                style={{ backgroundColor: brandSwatch }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-white">{tenant.name}</span>
                <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-400">
                  {tenant.slug}
                </code>
                {tenant.isPublic ? (
                  <span className="rounded border border-green-800 bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                    Public
                  </span>
                ) : null}
                {!tenant.isActive ? (
                  <span className="rounded border border-red-800 bg-red-900/50 px-1.5 py-0.5 text-xs text-red-400">
                    Inactive
                  </span>
                ) : null}
              </div>
              {tenant.description ? (
                <p className="mt-0.5 truncate text-sm text-slate-400">
                  {tenant.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-600">Direct URL: /t/{tenant.slug}</p>
            </div>

            {tenant.isActive ? (
              <div className="flex flex-shrink-0 gap-2">
                <a
                  href={`/admin/members?tenant=${encodeURIComponent(tenant.slug)}`}
                  className="rounded border border-blue-800 bg-blue-900/40 px-3 py-1.5 text-sm text-blue-300 transition-colors hover:bg-blue-900/60"
                >
                  Manage Access
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminAssign((current) => !current);
                    setAdminError("");
                    setAdminSuccess("");
                  }}
                  className="rounded border border-emerald-800 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-300 transition-colors hover:bg-emerald-900/60"
                >
                  {showAdminAssign ? "Close Assign" : "Assign Admin"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={deactivate}
                  disabled={deactivating}
                  className="rounded border border-red-800 bg-red-900/40 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-900/60 disabled:opacity-50"
                >
                  {deactivating ? "..." : "Deactivate"}
                </button>
              </div>
            ) : null}
          </div>

          {tenant.isActive && showAdminAssign ? (
            <form
              onSubmit={assignTenantAdmin}
              className="rounded-lg border border-slate-700 bg-slate-900/60 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-400">
                    Tenant admin email
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    placeholder="admin@example.com"
                    className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={assigningAdmin || !adminEmail.trim()}
                    className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {assigningAdmin ? "Assigning..." : "Add Tenant Admin"}
                  </button>
                </div>
              </div>

              {adminError ? <p className="mt-3 text-sm text-red-400">{adminError}</p> : null}
              {adminSuccess ? (
                <p className="mt-3 text-sm text-emerald-400">{adminSuccess}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sessionEmail, setSessionEmail] = useState("");

  useEffect(() => {
    apiFetch("/api/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.email) {
          setSessionEmail(data.email);
        }
      })
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const response = await apiFetch("/api/admin/tenants");
      if (response.status === 403) {
        setError("Super-admin access required.");
        setLoading(false);
        return;
      }
      if (!response.ok) {
        throw new Error();
      }
      setTenants(await response.json());
    } catch {
      setError("Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleUpdate(id: string, changes: Partial<TenantListItem>) {
    const response = await apiFetch(`/api/admin/tenants?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });

    if (response.ok) {
      await load();
    }
  }

  async function handleDeactivate(id: string) {
    const response = await apiFetch(`/api/admin/tenants?id=${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      await load();
    }
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-sm text-slate-400 transition-colors hover:text-white">
            {"<- Admin"}
          </a>
          <h1 className="font-semibold text-white">Organizations</h1>
        </div>
        {sessionEmail ? (
          <AccountMenu email={sessionEmail} activeScopeLabel="Platform" />
        ) : null}
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <CreateTenantForm onCreated={load} />

        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">
            All Organizations ({tenants.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded border border-red-800 bg-red-900/30 p-4 text-sm text-red-300">
              {error}
            </div>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-slate-500">No organizations yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {tenants.map((tenant) => (
                <TenantRow
                  key={tenant.id}
                  tenant={tenant}
                  onUpdate={handleUpdate}
                  onDeactivate={handleDeactivate}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
