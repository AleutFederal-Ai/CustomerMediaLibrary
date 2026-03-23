"use client";

import { useMemo, useState } from "react";
import {
  ApiEndpointDefinition,
  ApiHealthSnapshot,
  ApiManualProbeResponse,
} from "@/types";
import { resolvePathTemplate } from "@/lib/api/registry";

interface Props {
  initialSnapshot: ApiHealthSnapshot;
}

function statusBadgeClass(status: "passed" | "failed" | "skipped") {
  if (status === "passed") return "ops-badge-success";
  if (status === "failed") return "ops-badge-danger";
  return "ops-badge-neutral";
}

function dependencyBadgeClass(ok: boolean | null) {
  if (ok === true) return "ops-badge-success";
  if (ok === false) return "ops-badge-danger";
  return "ops-badge-neutral";
}

function applySampleTokens(template: string, snapshot: ApiHealthSnapshot): string {
  return template
    .replaceAll("{activeTenantId}", snapshot.samples.activeTenantId ?? "")
    .replaceAll("{activeTenantSlug}", snapshot.samples.activeTenantSlug ?? "")
    .replaceAll("{sampleAlbumId}", snapshot.samples.sampleAlbumId ?? "")
    .replaceAll("{sampleMediaId}", snapshot.samples.sampleMediaId ?? "");
}

export default function ApiHealthPortal({ initialSnapshot }: Props) {
  const firstEndpoint = initialSnapshot.endpoints[0];
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEndpointId, setSelectedEndpointId] = useState(
    firstEndpoint?.id ?? ""
  );
  const [manualPath, setManualPath] = useState(
    firstEndpoint
      ? resolvePathTemplate(firstEndpoint.pathTemplate, initialSnapshot.samples) ??
          applySampleTokens(firstEndpoint.pathTemplate, initialSnapshot)
      : "/api/health"
  );
  const [manualMethod, setManualMethod] = useState(
    firstEndpoint?.method ?? "GET"
  );
  const [manualBody, setManualBody] = useState(
    firstEndpoint?.sampleBody
      ? applySampleTokens(firstEndpoint.sampleBody, initialSnapshot)
      : ""
  );
  const [allowMutating, setAllowMutating] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const [manualResult, setManualResult] = useState<ApiManualProbeResponse | null>(
    null
  );
  const [manualError, setManualError] = useState("");

  const groupedEndpoints = useMemo(() => {
    return snapshot.endpoints.reduce<Record<string, ApiEndpointDefinition[]>>(
      (groups, endpoint) => {
        groups[endpoint.category] ??= [];
        groups[endpoint.category].push(endpoint);
        return groups;
      },
      {}
    );
  }, [snapshot.endpoints]);

  const automatedResultMap = useMemo(() => {
    return new Map(
      snapshot.probes.results.map((result) => [result.endpointId, result])
    );
  }, [snapshot.probes.results]);

  function syncManualRunner(endpointId: string) {
    const endpoint = snapshot.endpoints.find((item) => item.id === endpointId);
    if (!endpoint) return;
    setSelectedEndpointId(endpoint.id);
    setManualMethod(endpoint.method);
    setManualPath(
      resolvePathTemplate(endpoint.pathTemplate, snapshot.samples) ??
        applySampleTokens(endpoint.pathTemplate, snapshot)
    );
    setManualBody(
      endpoint.sampleBody ? applySampleTokens(endpoint.sampleBody, snapshot) : ""
    );
    setManualResult(null);
    setManualError("");
  }

  async function refreshSnapshot() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/api-health", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to refresh API health.");
      }
      setSnapshot(data);
      if (selectedEndpointId) {
        syncManualRunner(selectedEndpointId);
      }
    } catch (error) {
      setManualError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  }

  async function runManualProbe() {
    setManualRunning(true);
    setManualError("");
    setManualResult(null);

    try {
      const response = await fetch("/api/admin/api-health/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: manualMethod,
          path: manualPath,
          requestBody: manualBody || undefined,
          allowMutating,
        }),
      });
      const data = await response.json();
      if (!response.ok && !("status" in data)) {
        throw new Error(data.error ?? "Manual probe failed.");
      }
      setManualResult(data);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : String(error));
    } finally {
      setManualRunning(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-4">
        {Object.entries(snapshot.dependencyHealth.checks).map(([key, check]) => (
          <div key={key} className="metric-card">
            <p className="metric-label">{key}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`ops-badge ${dependencyBadgeClass(check.ok)}`}>
                {check.ok === true ? "Healthy" : check.ok === false ? "Failing" : "N/A"}
              </span>
              {check.latencyMs != null ? (
                <span className="ops-muted text-sm">{check.latencyMs}ms</span>
              ) : null}
            </div>
            <p className="metric-subtext">{check.message}</p>
          </div>
        ))}
      </section>

      <section className="surface-card-soft rounded-[1.35rem] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="hero-kicker">Automated Smoke Suite</p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
              Safe endpoint verification
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
              These probes exercise non-destructive endpoints using the current
              session scope and available tenant sample data.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <span className="chip chip-accent">
              Passed
              <strong>{snapshot.probes.summary.passed}</strong>
            </span>
            <span className="chip">
              Failed
              <strong>{snapshot.probes.summary.failed}</strong>
            </span>
            <span className="chip">
              Skipped
              <strong>{snapshot.probes.summary.skipped}</strong>
            </span>
            <button
              type="button"
              onClick={refreshSnapshot}
              disabled={refreshing}
              className="ops-button"
            >
              {refreshing ? "Refreshing..." : "Run Automated Suite"}
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="ops-table text-sm">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Path</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.probes.results.map((result) => (
                <tr key={result.endpointId}>
                  <td className="text-white">{result.endpointId}</td>
                  <td className="ops-code ops-muted max-w-[320px] truncate">
                    {result.path}
                  </td>
                  <td>
                    <span className={`ops-badge ${statusBadgeClass(result.status)}`}>
                      {result.status}
                    </span>
                  </td>
                  <td className="ops-muted">
                    {result.durationMs != null ? `${result.durationMs}ms` : "-"}
                  </td>
                  <td className="ops-muted max-w-[340px]">
                    <span title={result.responsePreview}>{result.message}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="surface-card-soft rounded-[1.35rem] p-5">
          <p className="hero-kicker">Endpoint Catalog</p>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
            Full API inventory
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            Every route is cataloged here. Safe endpoints are smoke-tested
            automatically; mutating or token-sensitive routes are available via
            the guarded manual runner.
          </p>

          <div className="mt-6 space-y-6">
            {Object.entries(groupedEndpoints).map(([category, endpoints]) => (
              <div key={category}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="hero-kicker">{category}</p>
                  <span className="chip">
                    Endpoints
                    <strong>{endpoints.length}</strong>
                  </span>
                </div>
                <div className="space-y-3">
                  {endpoints.map((endpoint) => {
                    const result = automatedResultMap.get(endpoint.id);
                    return (
                      <button
                        key={endpoint.id}
                        type="button"
                        onClick={() => syncManualRunner(endpoint.id)}
                        className={`w-full rounded-[1.1rem] border px-4 py-4 text-left ${
                          selectedEndpointId === endpoint.id
                            ? "border-[rgba(105,211,255,0.28)] bg-[rgba(105,211,255,0.08)]"
                            : "border-[rgba(140,172,197,0.12)] bg-[rgba(7,18,28,0.4)]"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="ops-badge ops-badge-info">
                            {endpoint.method}
                          </span>
                          <span className="ops-badge ops-badge-neutral">
                            {endpoint.authScope}
                          </span>
                          <span
                            className={`ops-badge ${
                              endpoint.verificationMode === "automated"
                                ? "ops-badge-success"
                                : "ops-badge-warning"
                            }`}
                          >
                            {endpoint.verificationMode}
                          </span>
                          {result ? (
                            <span className={`ops-badge ${statusBadgeClass(result.status)}`}>
                              {result.status}
                            </span>
                          ) : null}
                        </div>
                        <p className="ops-code mt-3 text-sm text-white">
                          {endpoint.pathTemplate}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">
                          {endpoint.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card-soft rounded-[1.35rem] p-5">
          <p className="hero-kicker">Manual Runner</p>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">
            Execute a live API request
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            Use this to validate endpoints that need tokens, sample payloads, or
            intentional mutation. Write-capable calls require an explicit
            confirmation toggle.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                Endpoint template
              </label>
              <select
                value={selectedEndpointId}
                onChange={(e) => syncManualRunner(e.target.value)}
                className="ops-select"
              >
                {snapshot.endpoints.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.method} {endpoint.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/86">
                  Method
                </label>
                <select
                  value={manualMethod}
                  onChange={(e) =>
                    setManualMethod(
                      e.target.value as ApiEndpointDefinition["method"]
                    )
                  }
                  className="ops-select"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-white/86">
                  Path
                </label>
                <input
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  className="ops-input ops-code"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/86">
                JSON body
              </label>
              <textarea
                value={manualBody}
                onChange={(e) => setManualBody(e.target.value)}
                rows={10}
                className="ops-textarea ops-code"
              />
            </div>

            <label className="flex items-start gap-3 rounded-[1rem] border border-[rgba(241,197,108,0.18)] bg-[rgba(96,76,21,0.18)] px-4 py-4 text-sm text-[#ffeab7]">
              <input
                type="checkbox"
                checked={allowMutating}
                onChange={(e) => setAllowMutating(e.target.checked)}
                className="mt-1 h-4 w-4 rounded"
              />
              <span>
                I understand that `POST`, `PATCH`, and `DELETE` requests can
                change live tenant or platform data.
              </span>
            </label>

            <button
              type="button"
              onClick={runManualProbe}
              disabled={manualRunning}
              className="ops-button"
            >
              {manualRunning ? "Running Probe..." : "Run Manual Probe"}
            </button>

            {manualError ? (
              <div className="ops-danger-panel rounded-[1rem] px-4 py-3 text-sm">
                {manualError}
              </div>
            ) : null}

            {manualResult ? (
              <div className="surface-card rounded-[1.1rem] p-4">
                <div className="flex flex-wrap gap-3">
                  <span className={`ops-badge ${manualResult.ok ? "ops-badge-success" : "ops-badge-danger"}`}>
                    {manualResult.ok ? "Success" : "Failure"}
                  </span>
                  <span className="chip">
                    HTTP
                    <strong>{manualResult.status}</strong>
                  </span>
                  <span className="chip">
                    Latency
                    <strong>{manualResult.durationMs}ms</strong>
                  </span>
                  <span className="chip">
                    Type
                    <strong>{manualResult.contentType}</strong>
                  </span>
                </div>
                <pre className="ops-code mt-4 overflow-x-auto rounded-[1rem] bg-[rgba(5,16,25,0.9)] p-4 text-xs text-[#d6f5ff]">
                  {manualResult.responseBody}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
