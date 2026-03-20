"use client";

import { useState } from "react";
import { AuditLogRecord, AuditAction } from "@/types";

interface Props {
  initialItems: AuditLogRecord[];
  initialCursor: string | null;
}

// Group audit actions into categories for easier filtering
const ACTION_GROUPS: Record<string, AuditAction[]> = {
  "Authentication": [
    AuditAction.MAGIC_LINK_REQUESTED,
    AuditAction.MAGIC_LINK_VERIFIED,
    AuditAction.MAGIC_LINK_FAILED,
    AuditAction.MAGIC_LINK_RATE_LIMITED,
    AuditAction.PASSWORD_LOGIN_SUCCESS,
    AuditAction.PASSWORD_LOGIN_FAILED,
    AuditAction.PASSWORD_SET,
    AuditAction.SESSION_CREATED,
    AuditAction.SESSION_EXPIRED,
    AuditAction.SESSION_REVOKED,
    AuditAction.TENANT_SWITCHED,
  ],
  "Media Access": [
    AuditAction.MEDIA_VIEWED,
    AuditAction.MEDIA_DOWNLOADED,
    AuditAction.BULK_DOWNLOAD,
    AuditAction.ALBUM_VIEWED,
  ],
  "Admin \u2014 Media": [
    AuditAction.MEDIA_UPLOADED,
    AuditAction.MEDIA_DELETED,
    AuditAction.ALBUM_CREATED,
    AuditAction.ALBUM_UPDATED,
    AuditAction.ALBUM_DELETED,
  ],
  "Admin \u2014 Users": [
    AuditAction.USER_BLOCKED,
    AuditAction.USER_UNBLOCKED,
    AuditAction.USER_PROMOTED,
  ],
  "Admin \u2014 Tenants": [
    AuditAction.TENANT_CREATED,
    AuditAction.TENANT_UPDATED,
    AuditAction.TENANT_DEACTIVATED,
    AuditAction.MEMBER_ADDED,
    AuditAction.MEMBER_REMOVED,
    AuditAction.MEMBER_ROLE_CHANGED,
    AuditAction.DOMAIN_ADDED,
    AuditAction.DOMAIN_DEACTIVATED,
  ],
};

// Color-code action badges by category
function actionColor(action: string): string {
  const authActions = ACTION_GROUPS["Authentication"] ?? [];
  const accessActions = ACTION_GROUPS["Media Access"] ?? [];

  if (authActions.includes(action as AuditAction)) {
    if (action.includes("failed") || action.includes("rate_limited")) {
      return "bg-red-900/50 text-red-300";
    }
    return "bg-blue-900/50 text-blue-300";
  }
  if (accessActions.includes(action as AuditAction)) {
    return "bg-green-900/50 text-green-300";
  }
  if (action.includes("deleted") || action.includes("blocked") || action.includes("deactivated") || action.includes("removed")) {
    return "bg-red-900/50 text-red-300";
  }
  return "bg-slate-700 text-slate-300";
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(", ");
}

export default function AuditLogViewer({ initialItems, initialCursor }: Props) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [ipSearch, setIpSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  function buildParams(reset: boolean): URLSearchParams {
    const params = new URLSearchParams();
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
    if (action) params.set("action", action);
    if (emailSearch.trim()) params.set("email", emailSearch.trim());
    if (ipSearch.trim()) params.set("ip", ipSearch.trim());
    if (!reset && cursor) params.set("cursor", cursor);
    return params;
  }

  async function fetchLogs(reset = false) {
    setLoading(true);
    try {
      const params = buildParams(reset);
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(reset ? data.items : [...items, ...data.items]);
        setCursor(data.continuationToken);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const params = buildParams(true);
      params.set("format", "csv");
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  }

  function handleClearFilters() {
    setFrom("");
    setTo("");
    setAction("");
    setEmailSearch("");
    setIpSearch("");
  }

  const hasFilters = from || to || action || emailSearch || ipSearch;

  return (
    <div className="space-y-4">
      {/* ─── Filters ──────────────────────────────────────────────── */}
      <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Email search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-400 mb-1">
              User Email
            </label>
            <input
              type="text"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="Search by email\u2026"
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* IP search */}
          <div className="min-w-[140px]">
            <label className="block text-xs text-slate-400 mb-1">
              IP Address
            </label>
            <input
              type="text"
              value={ipSearch}
              onChange={(e) => setIpSearch(e.target.value)}
              placeholder="e.g. 192.168\u2026"
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Action filter — grouped */}
          <div className="min-w-[180px]">
            <label className="block text-xs text-slate-400 mb-1">Action</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All actions</option>
              {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
                <optgroup key={group} label={group}>
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {formatAction(a)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fetchLogs(true)}
            disabled={loading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
          >
            {loading ? "Searching\u2026" : "Search"}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                handleClearFilters();
                // Refetch unfiltered after clearing
                setTimeout(() => fetchLogs(true), 0);
              }}
              className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
            >
              Clear Filters
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors ml-auto"
          >
            {exporting ? "Exporting\u2026" : "Export CSV"}
          </button>
        </div>
      </div>

      {/* ─── Results count ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-xs">
          {items.length} entries{cursor ? " (more available)" : ""}
        </p>
      </div>

      {/* ─── Table ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium pr-3">Timestamp</th>
              <th className="pb-2 font-medium pr-3">User</th>
              <th className="pb-2 font-medium pr-3">Action</th>
              <th className="pb-2 font-medium pr-3">IP Address</th>
              <th className="pb-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((log) => (
              <tr key={log.id} className="group hover:bg-slate-800/50">
                <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="py-2.5 pr-3 text-white">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailSearch(log.userEmail);
                      fetchLogs(true);
                    }}
                    className="hover:text-blue-300 transition-colors text-left"
                    title={`Filter by ${log.userEmail}`}
                  >
                    {log.userEmail}
                  </button>
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${actionColor(log.action)}`}
                  >
                    {formatAction(log.action)}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-slate-400 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setIpSearch(log.ipAddress);
                      fetchLogs(true);
                    }}
                    className="hover:text-blue-300 transition-colors font-mono"
                    title={`Filter by ${log.ipAddress}`}
                  >
                    {log.ipAddress}
                  </button>
                </td>
                <td className="py-2.5 text-slate-500 max-w-[300px]">
                  <span className="block truncate" title={JSON.stringify(log.detail)}>
                    {formatDetail(log.detail)}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No audit logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Pagination ────────────────────────────────────────────── */}
      {cursor && (
        <button
          type="button"
          onClick={() => fetchLogs(false)}
          disabled={loading}
          className="w-full py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
        >
          {loading ? "Loading\u2026" : "Load more"}
        </button>
      )}
    </div>
  );
}
