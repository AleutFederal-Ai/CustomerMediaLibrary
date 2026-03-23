"use client";

import { useState } from "react";
import { UserRecord } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialUsers: UserRecord[];
  initialCursor?: string | null;
}

export default function UserManager({ initialUsers, initialCursor }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(initialCursor ?? null);

  // Set password state
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");

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

  async function handleBlockToggle(user: UserRecord) {
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
          prev.map((u) =>
            u.id === user.id ? { ...u, isBlocked: !u.isBlocked } : u
          )
        );
      } else {
        alert("Failed to update user.");
      }
    } catch {
      alert("Network error.");
    }
  }

  async function handlePromoteToggle(user: UserRecord) {
    const promoting = !user.isPlatformAdmin;
    const msg = promoting
      ? `Promote ${user.email} to platform admin? They will have full access to all tenants.`
      : `Demote ${user.email}? They will lose platform admin privileges.`;

    if (!confirm(msg)) return;

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
            u.id === user.id
              ? { ...u, isPlatformAdmin: promoting }
              : u
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

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email\u2026"
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
        >
          {loading ? "\u2026" : "Search"}
        </button>
      </form>

      {/* Set Password inline form */}
      {passwordTarget && (
        <form
          onSubmit={handleSetPassword}
          className="p-4 bg-slate-800 border border-slate-700 rounded-lg space-y-3"
        >
          <h3 className="text-white text-sm font-medium">
            Set password for {passwordTarget}
          </h3>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 12 characters"
              minLength={12}
              required
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {passwordError && (
            <p className="text-red-400 text-sm">{passwordError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={passwordSaving || password.length < 12}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              {passwordSaving ? "Setting\u2026" : "Set Password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPasswordTarget(null);
                setPassword("");
                setPasswordError("");
              }}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium">Email</th>
              <th className="pb-2 font-medium">Last Login</th>
              <th className="pb-2 font-medium">Logins</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => (
              <tr
                key={user.id}
                className={user.isBlocked ? "opacity-60" : ""}
              >
                <td className="py-3 text-white">
                  <span>{user.email}</span>
                  {user.isPlatformAdmin && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-purple-900/50 text-purple-300 border border-purple-800">
                      Admin
                    </span>
                  )}
                </td>
                <td className="py-3 text-slate-400">
                  {new Date(user.lastLoginAt).toLocaleDateString()}
                </td>
                <td className="py-3 text-slate-400">{user.loginCount}</td>
                <td className="py-3">
                  {user.isBlocked ? (
                    <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-300">
                      Blocked
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-300">
                      Active
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleBlockToggle(user)}
                      className={`text-xs transition-colors ${
                        user.isBlocked
                          ? "text-green-400 hover:text-green-300"
                          : "text-red-400 hover:text-red-300"
                      }`}
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
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Set Password
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePromoteToggle(user)}
                      className={`text-xs transition-colors ${
                        user.isPlatformAdmin
                          ? "text-amber-400 hover:text-amber-300"
                          : "text-purple-400 hover:text-purple-300"
                      }`}
                    >
                      {user.isPlatformAdmin ? "Demote" : "Promote"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {cursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded transition-colors"
          >
            {loading ? "Loading\u2026" : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
