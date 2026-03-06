import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

// ----------------------------------------------------------------
// Dev / emulator mode
// When AZURE_KEY_VAULT_URI is absent, read secrets from DEV_SECRET_*
// environment variables. This is ONLY for local Docker testing.
// Never use this path in production.
// ----------------------------------------------------------------

const KV_URI = process.env.AZURE_KEY_VAULT_URI;
const IS_DEV_MODE = !KV_URI;

// Guard against accidentally running without Key Vault in a real deployment.
// We check DOCKER_DEV rather than NODE_ENV because Next.js inlines NODE_ENV
// at build time, making the runtime value invisible to server bundles.
if (IS_DEV_MODE && process.env.DOCKER_DEV !== "true") {
  throw new Error(
    "AZURE_KEY_VAULT_URI must be set. " +
      "For local Docker testing, add DOCKER_DEV=true to your .env.docker file."
  );
}

let secretClient: SecretClient | null = null;

if (KV_URI) {
  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });
  secretClient = new SecretClient(KV_URI, credential);
}

// In-memory cache — secrets are immutable within a process lifetime
const cache = new Map<string, string>();

export async function getSecret(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  if (IS_DEV_MODE) {
    // Read from DEV_SECRET_<NAME> env var (e.g. DEV_SECRET_SessionSigningSecret)
    const envKey = `DEV_SECRET_${name}`;
    const value = process.env[envKey];
    if (!value) {
      throw new Error(
        `[Dev mode] Environment variable "${envKey}" is not set. ` +
          `Add it to your .env.docker file.`
      );
    }
    cache.set(name, value);
    return value;
  }

  const secret = await secretClient!.getSecret(name);

  if (!secret.value) {
    throw new Error(`Key Vault secret "${name}" exists but has no value`);
  }

  cache.set(name, secret.value);
  return secret.value;
}

export async function warmSecrets(): Promise<void> {
  await Promise.all([
    getSecret("SessionSigningSecret"),
    getSecret("MagicLinkSigningSecret"),
    getSecret("CosmosDbEndpoint"),
    getSecret("StorageAccountName"),
    getSecret("AdminGroupObjectId"),
    getSecret("GraphTenantId"),
    getSecret("GraphClientId"),
    getSecret("MailSenderAddress"),
  ]);
}
