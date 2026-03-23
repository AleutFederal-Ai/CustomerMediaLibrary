"use client";

import React, { useState, useEffect } from "react";
import { TenantListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,62}[a-z0-9]$/;

// ─── Create tenant form ────────────────────────────────────────────────────

function CreateTenantForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1e3a5f");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function autoSlug(n: string) {
    return n
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 64);
  }

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault();
    if (!SLUG_RE.test(slug)) {
      setError("Slug must be lowercase alphanumeric with hyphens (min 2 chars).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/tenants", {
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
      if (res.ok) {
        setName(""); setSlug(""); setIsPublic(false);
        setDescription(""); setLogoUrl(""); setBrandColor("#1e3a5f");
        onCreated();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Failed to create tenant.");
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-slate-800 border border-slate-700 rounded-lg">
      <h3 className="text-white font-medium text-base">New Organization</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }}
            placeholder="Acme Corp"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Slug * <span className="text-slate-500 font-normal">(URL identifier)</span></label>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="acme-corp"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p className="text-slate-500 text-xs mt-1">Direct URL: /t/{slug || "…"}</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1">Description <span className="text-slate-500 font-normal">(optional)</span></label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description shown on the login page"
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Logo URL <span className="text-slate-500 font-normal">(optional)</span></label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Brand color</label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-slate-600 bg-slate-700"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          id="is-public"
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="is-public" className="text-sm text-slate-300 cursor-pointer">
          <span className="font-medium">Public</span>
          <span className="text-slate-500 ml-1">— appears in the organization selection list on the login page</span>
        </label>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={saving || !name || !slug}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
      >
        {saving ? "Creating…" : "Create Organization"}
      </button>
    </form>
  );
}

// ─── Tenant row ────────────────────────────────────────────────────────────

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

  async function save() {
    setSaving(true);
    await onUpdate(tenant.id, { name, isPublic, description, logoUrl, brandColor });
    setSaving(false);
    setEditing(false);
  }

  async function deactivate() {
    if (!confirm(`Deactivate "${tenant.name}"? Users will lose access immediately.`)) return;
    setDeactivating(true);
    await onDeactivate(tenant.id);
  }

  const brandC = brandColor || "#1e3a5f";

  return (
    <div className={`p-5 bg-slate-800 border rounded-lg ${tenant.isActive ? "border-slate-700" : "border-slate-700 opacity-50"}`}>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Slug <span className="text-slate-600">(read-only)</span></label>
              <input
                type="text"
                value={tenant.slug}
                disabled
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-500 text-sm font-mono cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Brand color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-slate-600 bg-slate-700"
                />
                <input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`pub-${tenant.id}`}
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600"
            />
            <label htmlFor={`pub-${tenant.id}`} className="text-sm text-slate-300 cursor-pointer">Public (shown on login page)</label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          {/* Brand swatch / logo */}
          {tenant.logoUrl ? (
            <img src={tenant.logoUrl} alt={tenant.name} className="w-10 h-10 rounded object-contain flex-shrink-0 mt-0.5" />
          ) : (
            <div
              className="w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-0.5"
              style={{ backgroundColor: brandC }}
            >
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-medium">{tenant.name}</span>
              <code className="text-slate-400 text-xs bg-slate-900 px-1.5 py-0.5 rounded">{tenant.slug}</code>
              {tenant.isPublic && (
                <span className="text-xs px-1.5 py-0.5 bg-green-900/50 text-green-400 border border-green-800 rounded">Public</span>
              )}
              {!tenant.isActive && (
                <span className="text-xs px-1.5 py-0.5 bg-red-900/50 text-red-400 border border-red-800 rounded">Inactive</span>
              )}
            </div>
            {tenant.description && (
              <p className="text-slate-400 text-sm mt-0.5 truncate">{tenant.description}</p>
            )}
            <p className="text-slate-600 text-xs mt-1">
              Direct URL: /t/{tenant.slug}
            </p>
          </div>

          {tenant.isActive && (
            <div className="flex gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={deactivate}
                disabled={deactivating}
                className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 text-sm rounded border border-red-800 transition-colors disabled:opacity-50"
              >
                {deactivating ? "…" : "Deactivate"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/tenants");
      if (res.status === 403) {
        setError("Super-admin access required.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error();
      setTenants(await res.json());
    } catch {
      setError("Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUpdate(id: string, changes: Partial<TenantListItem>) {
    const res = await apiFetch(`/api/admin/tenants?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (res.ok) await load();
  }

  async function handleDeactivate(id: string) {
    const res = await apiFetch(`/api/admin/tenants?id=${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/admin" className="text-slate-400 hover:text-white text-sm transition-colors">← Admin</a>
          <h1 className="text-white font-semibold">Organizations</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Create form */}
        <CreateTenantForm onCreated={load} />

        {/* Existing tenants */}
        <section>
          <h2 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-4">
            All Organizations ({tenants.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">{error}</div>
          ) : tenants.length === 0 ? (
            <p className="text-slate-500 text-sm">No organizations yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {tenants.map((t) => (
                <TenantRow
                  key={t.id}
                  tenant={t}
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
