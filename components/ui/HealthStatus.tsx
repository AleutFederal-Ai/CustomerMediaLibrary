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

  const statusBadgeClass = error
    ? "ops-badge-danger"
    : overallStatus === "healthy"
    ? "ops-badge-success"
    : overallStatus === "degraded"
    ? "ops-badge-danger"
    : "ops-badge-warning";

  return (
    <section className="surface-card-soft rounded-[1.45rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="hero-kicker">Platform Health</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`ops-badge ${statusBadgeClass}`}>
              <OverallDot status={overallStatus} loading={loading} />
              {loading ? "Checking" : overallStatus ?? "Unknown"}
            </span>
            <span
              className={
                overallStatus === "healthy"
                  ? "text-sm text-[var(--success)]"
                  : overallStatus === "degraded" || error
                  ? "text-sm text-[var(--danger)]"
                  : "ops-muted text-sm"
              }
            >
              {overallLabel}
            </span>
          </div>
          <p className="max-w-md text-sm leading-7 text-[var(--text-muted)]">
            Live dependency status for storage, secrets, graph, and data-plane
            services that support sign-in and tenant operations.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHealth}
          disabled={loading}
          className="ops-button-secondary w-full justify-center sm:w-auto"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="ops-danger-panel mt-5 rounded-[1rem] px-4 py-3 text-sm">
          Could not reach the platform health endpoint.
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {health
          ? Object.entries(health.checks).map(([key, check]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-[1rem] border border-[rgba(140,172,197,0.12)] bg-[rgba(7,18,28,0.44)] px-4 py-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-3 text-white/90">
                  <StatusDot ok={check.ok} />
                  <span className="truncate">{SERVICE_LABELS[key] ?? key}</span>
                </span>
                <span className="flex flex-shrink-0 items-center gap-3 text-[var(--text-muted)]">
                  {check.latencyMs != null && check.ok ? (
                    <span>{check.latencyMs}ms</span>
                  ) : null}
                  <span
                    className={
                      check.ok === true
                        ? "text-[var(--success)]"
                        : check.ok === false
                        ? "text-[var(--danger)]"
                        : "ops-muted"
                    }
                  >
                    {check.ok === true
                      ? "OK"
                      : check.ok === false
                      ? "Issue"
                      : "n/a"}
                  </span>
                </span>
              </div>
            ))
          : Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-[52px] animate-pulse rounded-[1rem] border border-[rgba(140,172,197,0.1)] bg-[rgba(7,18,28,0.42)]"
              />
            ))}
      </div>

      <div className="mt-5 flex flex-col gap-2 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span>
          {lastChecked
            ? `Last checked ${lastChecked.toLocaleTimeString()}`
            : "Awaiting first health response"}
        </span>
        <span>Auto-refreshes every 30 seconds</span>
      </div>
    </section>
  );
}
