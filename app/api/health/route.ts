import { NextResponse } from "next/server";
import { getContainer, CONTAINERS } from "@/lib/azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean | null; // null = not applicable in this environment
  message: string;
  latencyMs?: number;
};

async function checkCosmos(): Promise<CheckResult> {
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

async function checkBlobStorage(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    let client: BlobServiceClient;

    if (connStr) {
      client = BlobServiceClient.fromConnectionString(connStr);
    } else if (process.env.AZURE_KEY_VAULT_URI) {
      // Production: derive account URL from Key Vault secret name convention
      // StorageAccountName secret → https://<name>.blob.core.usgovcloudapi.net
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

    await client.getAccountInfo();
    return { ok: true, message: "connected", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkKeyVault(): Promise<CheckResult> {
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
    // List one secret to confirm connectivity — does not retrieve values
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

async function checkGraphApi(): Promise<CheckResult> {
  const graphEndpoint =
    process.env.GRAPH_ENDPOINT ?? "https://graph.microsoft.us";
  const start = Date.now();
  try {
    const res = await fetch(`${graphEndpoint}/v1.0/$metadata`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    // 200 = reachable, 401 = reachable (needs auth) — both mean the endpoint is up
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

export async function GET() {
  const [cosmosDb, blobStorage, keyVault, graphApi] = await Promise.all([
    checkCosmos(),
    checkBlobStorage(),
    checkKeyVault(),
    checkGraphApi(),
  ]);

  const checks = { cosmosDb, blobStorage, keyVault, graphApi };

  // Status: degraded if any configured service is failing
  const configuredChecks = Object.values(checks).filter((c) => c.ok !== null);
  const allOk = configuredChecks.every((c) => c.ok === true);
  const anyFailing = configuredChecks.some((c) => c.ok === false);

  const status = allOk ? "healthy" : anyFailing ? "degraded" : "unknown";

  return NextResponse.json(
    { status, timestamp: new Date().toISOString(), checks },
    { status: status === "degraded" ? 503 : 200 }
  );
}
