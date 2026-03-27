"use client";

import { useState } from "react";
import { TenantAdminListItem, UserAdminListItem, MemberRole } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialUsers: UserAdminListItem[];
  initialCursor?: string | null;
  availableTenants: TenantAdminListItem[];
}

export default function UserManager({
  initialUsers,
  initialCursor,
  availableTenants,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(initialCursor ?? null);
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createTenantId, setCreateTenantId] = useState("");
  const [createRole, setCreateRole] = useState<MemberRole>("viewer");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");

  async function fetchUsers(searchTerm: string, appendCursor?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (appendCursor) params.set("cursor", appendCursor);
      const res = await apiFetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (appendCursor) {
          setUsers((prev) => [...prev, ...data.items]);
        } else {
          setUsers(data.items);
        }
        setCursor(data.continuationToken ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await fetchUsers(search);
  }

  async function handleLoadMore() {
    if (!cursor) return;
    await fetchUsers(search, cursor);
  }

  async function handleBlockToggle(user: UserAdminListItem) {
    const action = user.isBlocked ? "unblock" : "block";
    const confirmMsg = user.isBlocked
      ? `Unblock ${user.email}?`
      : `Block ${user.email}? This will immediately revoke all their active sessions.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u))
        );
      } else {
        alert("Failed to update user.");
      }
    } catch {
      alert("Network error.");
    }
  }

  async function handlePromoteToggle(user: UserAdminListItem) {
    const promoting = !user.isPlatformAdmin;
    const message = promoting
      ? `Promote ${user.email} to platform admin? They will have full access to all tenants.`
      : `Demote ${user.email}? They will lose platform admin privileges.`;

    if (!confirm(message)) return;

    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          isPlatformAdmin: promoting,
        }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, isPlatformAdmin: promoting } : u
          )
        );
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to update user.");
      }
    } catch {
      alert("Network error.");
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordTarget || password.length < 12) return;
    setPasswordSaving(true);
    setPasswordError("");

    try {
      const res = await apiFetch("/api/admin/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: passwordTarget, password }),
      });

      if (res.ok) {
        setPasswordTarget(null);
        setPassword("");
      } else {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error ?? "Failed to set password.");
      }
    } catch {
      setPasswordError("Network error.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateSaving(true);
    setCreateError("");

    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createEmail,
          action: "create",
          tenantId: createTenantId || undefined,
          tenantRole: createRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error ?? "Failed to add user.");
        return;
      }

      setCreateEmail("");
      setCreateTenantId("");
      setCreateRole("viewer");
      await fetchUsers(search);
    } catch {
      setCreateError("Network error.");
    } finally {
      setCreateSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="surface-card-soft rounded-[1.25rem] p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Search by email
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="user@example.com"
              className="ops-input"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="ops-button">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </form>

      <form onSubmit={handleCreateUser} className="surface-card-soft rounded-[1.25rem] p-5">
        <p className="hero-kicker">Direct User Provisioning</p>
        <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
          Create or assign a user without requiring first login
        </h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Email address
            </label>
            <input
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="user@example.com"
              required
              className="ops-input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Tenant (optional)
            </label>
            <select
              value={createTenantId}
              onChange={(e) => setCreateTenantId(e.target.value)}
              className="ops-select"
            >
              <option value="">No tenant assignment</option>
              {availableTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">Tenant role</label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as MemberRole)}
              disabled={!createTenantId}
              className="ops-select"
            >
              <option value="viewer">Viewer</option>
              <option value="contributor">Media Contributor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={createSaving} className="ops-button">
              {createSaving ? "Saving..." : "Add User"}
            </button>
          </div>
        </div>
        {createError ? <p className="mt-3 text-sm text-[#ffb7b7]">{createError}</p> : null}
      </form>

      {passwordTarget ? (
        <form
          onSubmit={handleSetPassword}
          className="surface-card-soft rounded-[1.25rem] p-5"
        >
          <p className="hero-kicker">Credential Update</p>
          <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-white">
            Set password for {passwordTarget}
          </h3>
          <div className="mt-4 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 12 characters"
              minLength={12}
              required
              className="ops-input"
            />
            {passwordError ? (
              <p className="text-sm text-[#ffb7b7]">{passwordError}</p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={passwordSaving || password.length < 12}
                className="ops-button"
              >
                {passwordSaving ? "Setting..." : "Set Password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordTarget(null);
                  setPassword("");
                  setPasswordError("");
                }}
                className="ops-button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : null}

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
                <td className="ops-muted">
                  {user.loginCount === 0
                    ? "Never"
                    : new Date(user.lastLoginAt).toLocaleDateString()}
                </td>
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
                      className={user.isBlocked ? "ops-button" : "ops-button-danger"}
                    >
                      {user.isBlocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordTarget(user.email);
                        setPassword("");
                        setPasswordError("");
                      }}
                      className="ops-button-secondary"
                    >
                      Set Password
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromoteToggle(user)}
                      className="ops-button-secondary"
                    >
                      {user.isPlatformAdmin ? "Demote" : "Promote"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="ops-empty">No users found.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="ops-button-secondary"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
