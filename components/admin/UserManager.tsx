"use client";

import { useState } from "react";
import { UserRecord } from "@/types";

interface Props {
  initialUsers: UserRecord[];
}

export default function UserManager({ initialUsers }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleBlockToggle(user: UserRecord) {
    const action = user.isBlocked ? "unblock" : "block";
    const confirmMsg = user.isBlocked
      ? `Unblock ${user.email}?`
      : `Block ${user.email}? This will immediately revoke all their active sessions.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/users", {
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

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>

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
              <tr key={user.id} className={user.isBlocked ? "opacity-60" : ""}>
                <td className="py-3 text-white">{user.email}</td>
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
    </div>
  );
}
