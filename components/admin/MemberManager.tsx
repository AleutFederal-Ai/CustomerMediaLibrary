"use client";

import { useState } from "react";
import { MembershipRecord, MemberRole, UserAdminListItem } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialMembers: MembershipRecord[];
  tenantId: string;
  initialUsers?: UserAdminListItem[];
  isPlatformAdmin?: boolean;
  impersonatedBy?: string;
}

export default function MemberManager({
  initialMembers,
  tenantId,
  initialUsers = [],
  isPlatformAdmin = false,
  impersonatedBy,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [users, setUsers] = useState(initialUsers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserEmail, setBusyUserEmail] = useState<string | null>(null);

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

    const res = await apiFetch(
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

  async function handleBlockToggle(user: UserAdminListItem) {
    const action = user.isBlocked ? "unblock" : "block";
    if (!confirm(`${user.isBlocked ? "Unblock" : "Block"} ${user.email}?`)) return;

    setBusyUserEmail(user.email);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update user.");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u))
      );
    } finally {
      setBusyUserEmail(null);
    }
  }

  async function handlePromoteToggle(user: UserAdminListItem) {
    const promoting = !user.isPlatformAdmin;
    if (
      !confirm(
        promoting
          ? `Promote ${user.email} to platform admin?`
          : `Demote ${user.email} from platform admin?`
      )
    ) {
      return;
    }

    setBusyUserEmail(user.email);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, isPlatformAdmin: promoting }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update user.");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isPlatformAdmin: promoting } : u))
      );
    } finally {
      setBusyUserEmail(null);
    }
  }

  async function handleImpersonate(userEmail: string) {
    if (!confirm(`Impersonate ${userEmail} inside this tenant?`)) return;

    setBusyUserEmail(userEmail);
    try {
      const response = await apiFetch("/api/admin/users/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, tenantId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error ?? "Failed to start impersonation.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyUserEmail(null);
    }
  }

  async function handleStopImpersonation() {
    setBusyUserEmail("__stop__");
    try {
      const response = await apiFetch("/api/admin/users/impersonate", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error ?? "Failed to stop impersonation.");
        return;
      }

      window.location.reload();
    } finally {
      setBusyUserEmail(null);
    }
  }

  const activeMembers = members.filter((m) => m.isActive);

  return (
    <div className="space-y-8">
      {impersonatedBy ? (
        <div className="ops-warning-panel rounded-[1.1rem] px-4 py-4 text-sm">
          You are currently impersonating another account. Platform admin: {impersonatedBy}.
          <div className="mt-3">
            <button
              type="button"
              disabled={busyUserEmail === "__stop__"}
              onClick={handleStopImpersonation}
              className="ops-button-secondary"
            >
              {busyUserEmail === "__stop__" ? "Stopping..." : "Stop Impersonation"}
            </button>
          </div>
        </div>
      ) : null}

      <section className="space-y-6">
        <form onSubmit={handleAdd} className="surface-card-soft rounded-[1.25rem] p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">Email address</label>
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
              <label className="mb-2 block text-sm font-medium text-white/86">Role</label>
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
                      onChange={(e) => handleRoleChange(member, e.target.value as MemberRole)}
                      className="ops-select max-w-[190px]"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="contributor">Media Contributor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="ops-muted capitalize">{member.source}</td>
                  <td className="ops-muted">{new Date(member.addedAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleRemove(member)}
                        className="ops-button-danger"
                      >
                        Remove
                      </button>
                      {isPlatformAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleImpersonate(member.userEmail)}
                          disabled={busyUserEmail === member.userEmail}
                          className="ops-button-secondary"
                        >
                          {busyUserEmail === member.userEmail ? "Starting..." : "Impersonate"}
                        </button>
                      ) : null}
                    </div>
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
      </section>

      {isPlatformAdmin ? (
        <section className="space-y-4">
          <div>
            <p className="hero-kicker">Platform User Controls</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">
              Cross-tenant user management
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="ops-table text-sm">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Last Login</th>
                  <th>Logins</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className={user.isBlocked ? "opacity-70" : ""}>
                    <td className="text-white">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{user.email}</span>
                        {user.isPlatformAdmin ? (
                          <span className="ops-badge ops-badge-warning">Admin</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="ops-muted">{new Date(user.lastLoginAt).toLocaleDateString()}</td>
                    <td className="ops-muted">{user.loginCount}</td>
                    <td>
                      <span
                        className={`ops-badge ${
                          user.isBlocked ? "ops-badge-danger" : "ops-badge-success"
                        }`}
                      >
                        {user.isBlocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleBlockToggle(user)}
                          disabled={busyUserEmail === user.email}
                          className={user.isBlocked ? "ops-button" : "ops-button-danger"}
                        >
                          {user.isBlocked ? "Unblock" : "Block"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePromoteToggle(user)}
                          disabled={busyUserEmail === user.email}
                          className="ops-button-secondary"
                        >
                          {user.isPlatformAdmin ? "Demote" : "Promote"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
