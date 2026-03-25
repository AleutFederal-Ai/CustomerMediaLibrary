"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

const POLL_INTERVAL_MS = 30_000;

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400" title="Not configured" />;
  }

  if (ok) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" title="Healthy" />;
  }

  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" title="Failing" />;
}

function OverallDot({
  status,
  loading,
}: {
  status: HealthResponse["status"] | null;
  loading: boolean;
}) {
  if (loading || status === null) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-400 animate-pulse" />;
  }

  if (status === "healthy") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />;
  }

  if (status === "degraded") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />;
  }

  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />;
}

export default function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const response = await fetch("/api/health", { cache: "no-store" });
      const data: HealthResponse = await response.json();
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
    const intervalId = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchHealth]);

  const overallStatus = error ? "degraded" : health?.status ?? null;
  const overallLabel = loading
    ? "Checking live service health"
    : error
    ? "Health endpoint unreachable"
    : overallStatus === "healthy"
    ? "All systems operational"
    : overallStatus === "degraded"
    ? "Some services need attention"
    : "Status unknown";

  const statusBadgeClass = error
    ? "ops-badge-danger"
    : overallStatus === "healthy"
    ? "ops-badge-success"
    : overallStatus === "degraded"
    ? "ops-badge-danger"
    : "ops-badge-warning";

  const checkEntries = useMemo(
    () => Object.entries(health?.checks ?? {}),
    [health]
  );

  return (
    <section className="surface-card-quiet rounded-[1.4rem] px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="hero-kicker">Platform Health</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`ops-badge ${statusBadgeClass}`}>
                <OverallDot status={overallStatus} loading={loading} />
                {loading ? "Checking" : overallStatus ?? "Unknown"}
              </span>
              <span className="text-sm text-[color:var(--text-muted)]">
                {overallLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/admin/api-health" className="ops-button-secondary">
              API Health Portal
            </Link>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="ops-button-ghost"
            >
              Raw Health JSON
            </a>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="ops-button-ghost"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="ops-button-ghost"
            >
              {expanded ? "Hide Details" : "Show Details"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(checkEntries.length > 0
            ? checkEntries
            : Object.keys(SERVICE_LABELS).map((key) => [key, null] as const)
          ).map(([key, check]) => (
            <span key={key} className="chip">
              <StatusDot ok={check?.ok ?? null} />
              {SERVICE_LABELS[key] ?? key}
            </span>
          ))}
        </div>

        {expanded ? (
          <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
            {error ? (
              <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
                Could not reach the platform health endpoint.
              </div>
            ) : null}

            <div className="grid gap-3">
              {checkEntries.length > 0
                ? checkEntries.map(([key, check]) => (
                    <div
                      key={key}
                      className="rounded-[1rem] border border-[color:var(--border)] bg-white/75 px-4 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <StatusDot ok={check.ok} />
                          <div>
                            <p className="text-sm font-semibold text-[color:var(--foreground)]">
                              {SERVICE_LABELS[key] ?? key}
                            </p>
                            <p className="text-xs text-[color:var(--text-muted)]">
                              {check.message}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-[color:var(--text-muted)] sm:text-right">
                          <p>
                            {check.ok === true
                              ? "Healthy"
                              : check.ok === false
                              ? "Issue detected"
                              : "Not configured"}
                          </p>
                          {check.latencyMs != null && check.ok ? (
                            <p>{check.latencyMs} ms</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                : Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-[68px] animate-pulse rounded-[1rem] border border-[color:var(--border)] bg-white/70"
                    />
                  ))}
            </div>

            <div className="flex flex-col gap-2 text-xs text-[color:var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
              <span>
                {lastChecked
                  ? `Last checked ${lastChecked.toLocaleTimeString()}`
                  : "Awaiting first health response"}
              </span>
              <span>Auto-refreshes every 30 seconds</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[color:var(--text-muted)]">
            Expand for dependency details and links into the authenticated
            health tools.
          </p>
        )}
      </div>
    </section>
  );
}
