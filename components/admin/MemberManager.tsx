"use client";

import { useState } from "react";
import { MembershipRecord, MemberRole } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialMembers: MembershipRecord[];
  tenantId: string;
}

export default function MemberManager({ initialMembers, tenantId }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/admin/members?tenantId=${tenantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: email, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to add member.");
        return;
      }

      const record: MembershipRecord = await res.json();
      setMembers((prev) => {
        const existing = prev.findIndex((m) => m.userEmail === record.userEmail);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = record;
          return updated;
        }
        return [record, ...prev];
      });
      setEmail("");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(member: MembershipRecord) {
    if (!confirm(`Remove ${member.userEmail} from this tenant?`)) return;

    const res = await fetch(
      `/api/admin/members?tenantId=${tenantId}&email=${encodeURIComponent(
        member.userEmail
      )}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      alert("Failed to remove member.");
      return;
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, isActive: false } : m))
    );
  }

  async function handleRoleChange(member: MembershipRecord, newRole: MemberRole) {
    if (newRole === member.role) return;

    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
    );

    try {
      const res = await apiFetch(`/api/admin/members?tenantId=${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: member.userEmail, role: newRole }),
      });

      if (!res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m))
        );
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to change role.");
      }
    } catch {
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: member.role } : m))
      );
      alert("Network error.");
    }
  }

  const activeMembers = members.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="surface-card-soft rounded-[1.25rem] p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="ops-input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as MemberRole)}
              className="ops-select"
            >
              <option value="viewer">Viewer</option>
              <option value="contributor">Media Contributor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={adding} className="ops-button">
              {adding ? "Adding..." : "Add Member"}
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-[#ffb7b7]">{error}</p> : null}
      </form>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="surface-card-soft rounded-[1.15rem] p-4">
          <p className="hero-kicker">Viewer</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            Read-only access to published gallery content.
          </p>
        </div>
        <div className="surface-card-soft rounded-[1.15rem] p-4">
          <p className="hero-kicker">Media Contributor</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            Upload, edit, and delete media within tenant albums.
          </p>
        </div>
        <div className="surface-card-soft rounded-[1.15rem] p-4">
          <p className="hero-kicker">Admin</p>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            Full tenant administration across membership, domains, and albums.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="ops-table text-sm">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Source</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((member) => (
              <tr key={member.id}>
                <td className="text-white">{member.userEmail}</td>
                <td>
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleRoleChange(member, e.target.value as MemberRole)
                    }
                    className="ops-select max-w-[190px]"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="contributor">Media Contributor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="ops-muted capitalize">{member.source}</td>
                <td className="ops-muted">
                  {new Date(member.addedAt).toLocaleDateString()}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => handleRemove(member)}
                    className="ops-button-danger"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {activeMembers.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="ops-empty">No members yet. Add one above.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
