"use client";

import { useState } from "react";
import { DomainRecord } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialDomains: DomainRecord[];
  tenantId: string;
}

export default function DomainManager({ initialDomains, tenantId }: Props) {
  const [domainList, setDomainList] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAdding(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/admin/domains?tenantId=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim().toLowerCase() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to add domain.");
        return;
      }

      const record: DomainRecord = await res.json();
      setDomainList((prev) => {
        const existing = prev.findIndex((d) => d.domain === record.domain);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], isActive: true };
          return updated;
        }
        return [record, ...prev];
      });
      setNewDomain("");
    } catch {
      setError("Network error.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeactivate(domain: DomainRecord) {
    if (!confirm(`Deactivate domain "${domain.domain}"? Users from this domain will lose auto-access.`))
      return;

    try {
      const res = await fetch(
        `/api/admin/domains?tenantId=${tenantId}&id=${domain.id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        alert("Failed to deactivate domain.");
        return;
      }

      setDomainList((prev) =>
        prev.map((d) => (d.id === domain.id ? { ...d, isActive: false } : d))
      );
    } catch {
      alert("Network error.");
    }
  }

  const activeDomains = domainList.filter((d) => d.isActive);
  const inactiveDomains = domainList.filter((d) => !d.isActive);

  return (
    <div className="space-y-6">
      {/* Add domain form */}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-slate-400 text-xs mb-1">
            Email domain
          </label>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            required
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
        >
          {adding ? "Adding\u2026" : "Add Domain"}
        </button>
        {error && <p className="w-full text-red-400 text-sm">{error}</p>}
      </form>

      <p className="text-slate-500 text-xs">
        Users with an email address matching an active domain will
        automatically gain viewer access to this organization when they log
        in.
      </p>

      {/* Active domains table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium">Domain</th>
              <th className="pb-2 font-medium">Added By</th>
              <th className="pb-2 font-medium">Added</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {activeDomains.map((d) => (
              <tr key={d.id}>
                <td className="py-3 text-white font-mono text-sm">
                  {d.domain}
                </td>
                <td className="py-3 text-slate-400">{d.addedBy}</td>
                <td className="py-3 text-slate-400">
                  {new Date(d.addedAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => handleDeactivate(d)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
            {activeDomains.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500">
                  No active domains. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inactive domains */}
      {inactiveDomains.length > 0 && (
        <div>
          <h3 className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-2">
            Inactive Domains
          </h3>
          <div className="overflow-x-auto opacity-60">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-800">
                {inactiveDomains.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 text-slate-400 font-mono text-sm">
                      {d.domain}
                    </td>
                    <td className="py-2 text-slate-500 text-xs">
                      Deactivated
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
