"use client";

import { useState } from "react";
import { AuditLogRecord, AuditAction } from "@/types";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  initialItems: AuditLogRecord[];
  initialCursor: string | null;
}

const ACTION_GROUPS: Record<string, AuditAction[]> = {
  Authentication: [
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
  "Admin - Media": [
    AuditAction.MEDIA_UPLOADED,
    AuditAction.MEDIA_DELETED,
    AuditAction.ALBUM_CREATED,
    AuditAction.ALBUM_UPDATED,
    AuditAction.ALBUM_DELETED,
  ],
  "Admin - Users": [
    AuditAction.USER_BLOCKED,
    AuditAction.USER_UNBLOCKED,
    AuditAction.USER_PROMOTED,
  ],
  "Admin - Tenants": [
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

function actionColor(action: string): string {
  const authActions = ACTION_GROUPS.Authentication ?? [];
  const accessActions = ACTION_GROUPS["Media Access"] ?? [];

  if (authActions.includes(action as AuditAction)) {
    if (action.includes("failed") || action.includes("rate_limited")) {
      return "ops-badge-danger";
    }
    return "ops-badge-info";
  }
  if (accessActions.includes(action as AuditAction)) {
    return "ops-badge-success";
  }
  if (
    action.includes("deleted") ||
    action.includes("blocked") ||
    action.includes("deactivated") ||
    action.includes("removed")
  ) {
    return "ops-badge-danger";
  }
  return "ops-badge-neutral";
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
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
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
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
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
      const res = await apiFetch(`/api/admin/audit?${params.toString()}`);
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
      const res = await apiFetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
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
    <div className="space-y-6">
      <div className="surface-card-soft rounded-[1.25rem] p-5">
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-white/86">
              User Email
            </label>
            <input
              type="text"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              placeholder="Search by email..."
              className="ops-input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              IP Address
            </label>
            <input
              type="text"
              value={ipSearch}
              onChange={(e) => setIpSearch(e.target.value)}
              placeholder="e.g. 192.168.1.10"
              className="ops-input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              From
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ops-input"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              To
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ops-input"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/86">
              Action
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="ops-select"
            >
              <option value="">All actions</option>
              {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
                <optgroup key={group} label={group}>
                  {actions.map((item) => (
                    <option key={item} value={item}>
                      {formatAction(item)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <button
              type="button"
              onClick={() => fetchLogs(true)}
              disabled={loading}
              className="ops-button"
            >
              {loading ? "Searching..." : "Search"}
            </button>
            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  handleClearFilters();
                  setTimeout(() => fetchLogs(true), 0);
                }}
                className="ops-button-secondary"
              >
                Clear Filters
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="ops-button-secondary"
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="chip">
          Loaded Events
          <strong>{items.length}</strong>
        </p>
        {cursor ? <p className="ops-muted text-sm">More events available</p> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="ops-table text-sm">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>IP Address</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id}>
                <td className="ops-muted whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="text-white">
                  <button
                    type="button"
                    onClick={() => {
                      setEmailSearch(log.userEmail);
                      fetchLogs(true);
                    }}
                    className="text-left hover:text-[#d9f6ff]"
                  >
                    {log.userEmail}
                  </button>
                </td>
                <td>
                  <span className={`ops-badge ${actionColor(log.action)}`}>
                    {formatAction(log.action)}
                  </span>
                </td>
                <td className="ops-code ops-muted whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setIpSearch(log.ipAddress);
                      fetchLogs(true);
                    }}
                    className="hover:text-[#d9f6ff]"
                  >
                    {log.ipAddress}
                  </button>
                </td>
                <td className="ops-muted max-w-[300px]">
                  <span className="block truncate" title={JSON.stringify(log.detail)}>
                    {formatDetail(log.detail)}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5}>
                  <div className="ops-empty">No audit logs found.</div>
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
            onClick={() => fetchLogs(false)}
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
