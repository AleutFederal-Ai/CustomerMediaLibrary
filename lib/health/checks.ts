import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { CONTAINERS, getContainer } from "@/lib/azure/cosmos";
import { DependencyHealthReport, ServiceCheckResult } from "@/types";
import { logInfo } from "@/lib/logging/structured";

async function checkCosmos(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    const container = await getContainer(CONTAINERS.SESSIONS);
    await container.read();
    return { ok: true, message: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkBlobStorage(): Promise<ServiceCheckResult> {
  const start = Date.now();
  try {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    let client: BlobServiceClient;

    if (connStr) {
      client = BlobServiceClient.fromConnectionString(connStr);
    } else if (process.env.AZURE_KEY_VAULT_URI) {
      const { getSecret } = await import("@/lib/azure/keyvault");
      const accountName = await getSecret("StorageAccountName");
      const credential = new DefaultAzureCredential({
        authorityHost: AzureAuthorityHosts.AzureGovernment,
      });
      client = new BlobServiceClient(
        `https://${accountName}.blob.core.usgovcloudapi.net`,
        credential
      );
    } else {
      return { ok: null, message: "not configured (dev mode)" };
    }

    const containerClient = client.getContainerClient("media");
    await containerClient.exists();
    return { ok: true, message: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkKeyVault(): Promise<ServiceCheckResult> {
  const kvUri = process.env.AZURE_KEY_VAULT_URI;
  if (!kvUri) {
    return { ok: null, message: "not configured (dev mode)" };
  }

  const start = Date.now();
  try {
    const credential = new DefaultAzureCredential({
      authorityHost: AzureAuthorityHosts.AzureGovernment,
    });
    const client = new SecretClient(kvUri, credential);
    const iter = client.listPropertiesOfSecrets();
    await iter.next();
    return { ok: true, message: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkGraphApi(): Promise<ServiceCheckResult> {
  const graphEndpoint =
    process.env.GRAPH_ENDPOINT ?? "https://graph.microsoft.us";
  const start = Date.now();
  try {
    const res = await fetch(`${graphEndpoint}/v1.0/$metadata`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    const reachable = res.status < 500;
    return {
      ok: reachable,
      message: reachable ? `reachable (HTTP ${res.status})` : `HTTP ${res.status}`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

export async function getDependencyHealthReport(): Promise<DependencyHealthReport> {
  const checks = {
    cosmosDb: await checkCosmos(),
    blobStorage: await checkBlobStorage(),
    keyVault: await checkKeyVault(),
    graphApi: await checkGraphApi(),
  };

  const configuredChecks = Object.values(checks).filter((c) => c.ok !== null);
  const allOk = configuredChecks.every((c) => c.ok === true);
  const anyFailing = configuredChecks.some((c) => c.ok === false);
  const status = allOk ? "healthy" : anyFailing ? "degraded" : "unknown";

  const report: DependencyHealthReport = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  logInfo("health.dependencies.checked", {
    status,
    checks,
  });

  return report;
}
