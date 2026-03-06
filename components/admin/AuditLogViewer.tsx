"use client";

import { useState } from "react";
import { AuditLogRecord, AuditAction } from "@/types";

interface Props {
  initialItems: AuditLogRecord[];
  initialCursor: string | null;
}

export default function AuditLogViewer({ initialItems, initialCursor }: Props) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [exporting, setExporting] = useState(false);

  async function fetchLogs(reset = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
      if (action) params.set("action", action);
      if (!reset && cursor) params.set("cursor", cursor);

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
      const params = new URLSearchParams({ format: "csv" });
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to + "T23:59:59").toISOString());
      if (action) params.set("action", action);

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
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
        <div>
          <label className="block text-xs text-slate-400 mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All actions</option>
            {Object.values(AuditAction).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs(true)}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded transition-colors"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded transition-colors"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="pb-2 font-medium pr-4">Timestamp</th>
              <th className="pb-2 font-medium pr-4">User</th>
              <th className="pb-2 font-medium pr-4">Action</th>
              <th className="pb-2 font-medium pr-4">IP</th>
              <th className="pb-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {items.map((log) => (
              <tr key={log.id}>
                <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-white truncate max-w-[160px]">
                  {log.userEmail}
                </td>
                <td className="py-2 pr-4">
                  <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                    {log.action}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-400 whitespace-nowrap">
                  {log.ipAddress}
                </td>
                <td className="py-2 text-slate-500 truncate max-w-[200px]">
                  {JSON.stringify(log.detail)}
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

      {cursor && (
        <button
          type="button"
          onClick={() => fetchLogs(false)}
          disabled={loading}
          className="w-full py-2 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
