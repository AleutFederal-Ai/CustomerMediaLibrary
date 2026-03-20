"use client";

import { useState } from "react";
import { MembershipRecord, MemberRole } from "@/types";

interface Props {
  initialMembers: MembershipRecord[];
  tenantId: string;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  viewer: "Viewer",
  contributor: "Media Contributor",
  admin: "Admin",
};

const ROLE_COLORS: Record<MemberRole, string> = {
  viewer: "bg-slate-700 text-slate-300",
  contributor: "bg-blue-900/50 text-blue-300",
  admin: "bg-purple-900/50 text-purple-300",
};

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
      const res = await fetch(`/api/admin/members?tenantId=${tenantId}`, {
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
      `/api/admin/members?tenantId=${tenantId}&email=${encodeURIComponent(member.userEmail)}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      alert("Failed to remove member.");
      return;
    }

    setMembers((prev) =>
      prev.map((m) => m.id === member.id ? { ...m, isActive: false } : m)
    );
  }

  async function handleRoleChange(member: MembershipRecord, newRole: MemberRole) {
    if (newRole === member.role) return;

    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
    );

    try {
      const res = await fetch(`/api/admin/members?tenantId=${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: member.userEmail, role: newRole }),
      });

      if (!res.ok) {
        // Revert on failure
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id ? { ...m, role: member.role } : m
          )
        );
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to change role.");
      }
    } catch {
      // Revert on network error
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, role: member.role } : m
        )
      );
      alert("Network error.");
    }
  }

  const activeMembers = members.filter((m) => m.isActive);

  return (
    <div className="space-y-6">
      {/* Add member form */}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-slate-400 text-xs mb-1">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-slate-400 text-xs mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="viewer">Viewer</option>
            <option value="contributor">Media Contributor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded transition-colors"
        >
          {adding ? "Adding\u2026" : "Add Member"}
        </button>
        {error && <p className="w-full text-red-400 text-sm">{error}</p>}
      </form>

      {/* Role legend */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span><span className="font-medium text-slate-300">Viewer</span> — read-only gallery access</span>
        <span><span className="font-medium text-blue-300">Media Contributor</span> — can upload, edit, and delete media within albums</span>
        <span><span className="font-medium text-purple-300">Admin</span> — full access including albums, users, and audit logs</span>
      </div>

      {/* Members table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium">Added</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {activeMembers.map((m) => (
              <tr key={m.id}>
                <td className="py-3 text-white">{m.userEmail}</td>
                <td className="py-3">
                  <select
                    value={m.role}
                    onChange={(e) =>
                      handleRoleChange(m, e.target.value as MemberRole)
                    }
                    className={`px-2 py-0.5 rounded text-xs border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${ROLE_COLORS[m.role]}`}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="contributor">Media Contributor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="py-3 text-slate-400 capitalize">{m.source}</td>
                <td className="py-3 text-slate-400">
                  {new Date(m.addedAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {activeMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No members yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
