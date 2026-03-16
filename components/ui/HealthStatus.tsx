"use client";

import { useState, useEffect, useCallback } from "react";

type CheckResult = {
  ok: boolean | null;
  message: string;
  latencyMs?: number;
};

type HealthResponse = {
  status: "healthy" | "degraded" | "unknown";
  timestamp: string;
  checks: {
    cosmosDb: CheckResult;
    blobStorage: CheckResult;
    keyVault: CheckResult;
    graphApi: CheckResult;
  };
};

const SERVICE_LABELS: Record<string, string> = {
  cosmosDb: "Cosmos DB",
  blobStorage: "Blob Storage",
  keyVault: "Key Vault",
  graphApi: "Graph API (Email)",
};

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" title="Not configured" />
    );
  }
  if (ok) {
    return (
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" title="Healthy" />
    );
  }
  return (
    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" title="Failing" />
  );
}

function OverallDot({
  status,
  loading,
}: {
  status: HealthResponse["status"] | null;
  loading: boolean;
}) {
  if (loading || status === null) {
    return (
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse" />
    );
  }
  if (status === "healthy") {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />;
  }
  if (status === "degraded") {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />;
  }
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />;
}

const POLL_INTERVAL_MS = 30_000;

export default function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch("/api/health", { cache: "no-store" });
      const data: HealthResponse = await res.json();
      setHealth(data);
      setLastChecked(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchHealth]);

  const overallStatus = error ? "degraded" : health?.status ?? null;

  const overallLabel = loading
    ? "Checking…"
    : error
    ? "Unreachable"
    : overallStatus === "healthy"
    ? "All systems operational"
    : overallStatus === "degraded"
    ? "Service degraded"
    : "Status unknown";

  return (
    <div className="w-full max-w-md mt-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600 transition-colors text-xs"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <OverallDot status={overallStatus} loading={loading} />
          <span>System Status</span>
          <span className="text-slate-500">—</span>
          <span
            className={
              overallStatus === "healthy"
                ? "text-green-400"
                : overallStatus === "degraded" || error
                ? "text-red-400"
                : "text-slate-400"
            }
          >
            {overallLabel}
          </span>
        </span>
        <span className="ml-2 text-slate-500">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 rounded bg-slate-800/60 border border-slate-700 px-3 py-3 space-y-2">
          {error && (
            <p className="text-red-400 text-xs">
              Could not reach health endpoint.
            </p>
          )}

          {health &&
            Object.entries(health.checks).map(([key, check]) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <StatusDot ok={check.ok} />
                  {SERVICE_LABELS[key] ?? key}
                </span>
                <span className="text-slate-500 flex items-center gap-2">
                  {check.latencyMs != null && check.ok && (
                    <span>{check.latencyMs}ms</span>
                  )}
                  <span
                    className={
                      check.ok === true
                        ? "text-green-400"
                        : check.ok === false
                        ? "text-red-400"
                        : "text-slate-500"
                    }
                  >
                    {check.ok === true
                      ? "OK"
                      : check.ok === false
                      ? check.message
                      : "n/a"}
                  </span>
                </span>
              </div>
            ))}

          <div className="pt-1 flex items-center justify-between text-xs text-slate-600 border-t border-slate-700">
            <span>
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString()}`
                : "Checking…"}
            </span>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="text-blue-500 hover:text-blue-400 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
