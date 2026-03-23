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
    if (
      !confirm(
        `Deactivate domain "${domain.domain}"? Users from this domain will lose auto-access.`
      )
    )
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
      <form onSubmit={handleAdd} className="surface-card-soft rounded-[1.25rem] p-5">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Email domain
            </label>
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              required
              className="ops-input"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={adding} className="ops-button">
              {adding ? "Adding..." : "Add Domain"}
            </button>
          </div>
        </div>

        <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
          Users whose email matches an active domain automatically gain viewer
          access to this organization when they log in.
        </p>

        {error ? <p className="mt-3 text-sm text-[#ffb7b7]">{error}</p> : null}
      </form>

      <div className="overflow-x-auto">
        <table className="ops-table text-sm">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Added By</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeDomains.map((domain) => (
              <tr key={domain.id}>
                <td className="ops-code text-white">{domain.domain}</td>
                <td className="ops-muted">{domain.addedBy}</td>
                <td className="ops-muted">
                  {new Date(domain.addedAt).toLocaleDateString()}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(domain)}
                    className="ops-button-danger"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
            {activeDomains.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="ops-empty">No active domains. Add one above.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {inactiveDomains.length > 0 ? (
        <div className="surface-card-soft rounded-[1.25rem] p-5">
          <p className="hero-kicker">Inactive Domains</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {inactiveDomains.map((domain) => (
              <span key={domain.id} className="chip ops-code">
                {domain.domain}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
