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
  graphApi: "Graph API",
};

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" title="Not configured" />;
  }
  if (ok) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--success)]" title="Healthy" />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--danger)] animate-pulse" title="Failing" />;
}

function OverallDot({
  status,
  loading,
}: {
  status: HealthResponse["status"] | null;
  loading: boolean;
}) {
  if (loading || status === null) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500 animate-pulse" />;
  }
  if (status === "healthy") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--success)]" />;
  }
  if (status === "degraded") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--danger)] animate-pulse" />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--warning)]" />;
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
    ? "Checking..."
    : error
    ? "Unreachable"
    : overallStatus === "healthy"
    ? "All systems operational"
    : overallStatus === "degraded"
    ? "Service degraded"
    : "Status unknown";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="surface-card-soft flex w-full items-center justify-between rounded-[1.15rem] px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3 text-sm">
          <OverallDot status={overallStatus} loading={loading} />
          <span className="font-medium text-white">Platform health</span>
          <span className="ops-muted hidden sm:inline">-</span>
          <span
            className={
              overallStatus === "healthy"
                ? "text-[var(--success)]"
                : overallStatus === "degraded" || error
                ? "text-[var(--danger)]"
                : "ops-muted"
            }
          >
            {overallLabel}
          </span>
        </span>
        <span className="ops-muted text-xs">{expanded ? "Collapse" : "Expand"}</span>
      </button>

      {expanded ? (
        <div className="surface-card-soft mt-2 space-y-3 rounded-[1.15rem] px-4 py-4">
          {error ? (
            <p className="text-sm text-[#ffb7b7]">Could not reach health endpoint.</p>
          ) : null}

          {health
            ? Object.entries(health.checks).map(([key, check]) => (
                <div key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-white/88">
                    <StatusDot ok={check.ok} />
                    {SERVICE_LABELS[key] ?? key}
                  </span>
                  <span className="flex items-center gap-2 text-[var(--text-muted)]">
                    {check.latencyMs != null && check.ok ? <span>{check.latencyMs}ms</span> : null}
                    <span
                      className={
                        check.ok === true
                          ? "text-[var(--success)]"
                          : check.ok === false
                          ? "text-[var(--danger)]"
                          : "ops-muted"
                      }
                    >
                      {check.ok === true ? "OK" : check.ok === false ? check.message : "n/a"}
                    </span>
                  </span>
                </div>
              ))
            : null}

          <div className="ops-divider" />

          <div className="flex flex-col gap-3 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString()}`
                : "Checking..."}
            </span>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="ops-button-ghost w-full justify-center sm:w-auto"
            >
              Refresh Status
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
