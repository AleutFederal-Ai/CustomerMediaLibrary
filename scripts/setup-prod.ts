/**
 * Production setup script
 * Creates missing Cosmos DB containers and seeds initial data.
 *
 * Prerequisites:
 *   1. Install Azure CLI: winget install -e --id Microsoft.AzureCLI
 *   2. az cloud set --name AzureUSGovernment
 *   3. az login --tenant 8b37dad1-f014-4751-907b-9c53d310a45f
 *
 * Run via: npx tsx scripts/setup-prod.ts
 */

import { CosmosClient } from "@azure/cosmos";
import {
  DefaultAzureCredential,
  AzureAuthorityHosts,
} from "@azure/identity";
import type { TokenCredential, GetTokenOptions, AccessToken } from "@azure/core-auth";

// Cosmos DB resource URI is https://cosmos.azure.com across all Azure clouds including GCCH.
class GcchCosmosCredential implements TokenCredential {
  constructor(private readonly inner: TokenCredential) {}
  getToken(_scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken | null> {
    return this.inner.getToken("https://cosmos.azure.com/.default", options);
  }
}
import { v4 as uuidv4 } from "uuid";

// ---- Configuration ----
const COSMOS_ENDPOINT = "https://mymedia-cosmos.documents.azure.us:443/";
const DB_NAME = "mediagallery";

// Containers that may be missing from the deployed infrastructure
const ENSURE_CONTAINERS = [
  { name: "tenants", partitionKey: "/id" },
  { name: "memberships", partitionKey: "/id" },
];

// Default tenant
const DEFAULT_TENANT_ID = "tenant-aleutfederal";
const DEFAULT_TENANT = {
  id: DEFAULT_TENANT_ID,
  name: "Aleut Federal",
  slug: "aleutfederal",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "setup-script",
};

// Domains to seed (from handoff document section 5)
const SEED_DOMAINS = [
  "aleutfederal.com",
  "aleutfederal.us",
  "us.af.mil",
  "ussf.mil",
];

async function main() {
  console.log("=== Media Gallery — Production Setup ===\n");

  // Authenticate using DefaultAzureCredential (picks up az login)
  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });

  console.log("Connecting to Cosmos DB (GCCH)…");
  const client = new CosmosClient({
    endpoint: COSMOS_ENDPOINT,
    aadCredentials: new GcchCosmosCredential(credential),
  });

  const { database } = await client.databases.createIfNotExists({
    id: DB_NAME,
  });
  console.log(`Database "${DB_NAME}" OK\n`);

  // 1. Ensure missing containers exist
  console.log("--- Ensuring containers ---");
  for (const def of ENSURE_CONTAINERS) {
    const { container } = await database.containers.createIfNotExists({
      id: def.name,
      partitionKey: { paths: [def.partitionKey] },
    });
    console.log(`  Container "${def.name}" (pk: ${def.partitionKey}) — OK`);
  }

  // 2. Seed default tenant
  console.log("\n--- Seeding default tenant ---");
  const tenantsContainer = database.container("tenants");
  const { resources: existingTenants } = await tenantsContainer.items
    .query({
      query: "SELECT c.id FROM c WHERE c.id = @id",
      parameters: [{ name: "@id", value: DEFAULT_TENANT_ID }],
    })
    .fetchAll();

  if (existingTenants.length === 0) {
    await tenantsContainer.items.create(DEFAULT_TENANT);
    console.log(
      `  Created tenant "${DEFAULT_TENANT.name}" (id: ${DEFAULT_TENANT_ID})`
    );
  } else {
    console.log(`  Tenant "${DEFAULT_TENANT.name}" already exists — skipped`);
  }

  // 3. Seed domains
  console.log("\n--- Seeding domain allowlist ---");
  const domainsContainer = database.container("domains");
  for (const domain of SEED_DOMAINS) {
    const { resources: existing } = await domainsContainer.items
      .query({
        query: "SELECT c.id FROM c WHERE c.domain = @domain",
        parameters: [{ name: "@domain", value: domain }],
      })
      .fetchAll();

    if (existing.length === 0) {
      await domainsContainer.items.create({
        id: uuidv4(),
        domain,
        tenantId: DEFAULT_TENANT_ID,
        addedAt: new Date().toISOString(),
        addedBy: "setup-script",
        isActive: true,
      });
      console.log(`  Seeded domain "${domain}" -> ${DEFAULT_TENANT_ID}`);
    } else {
      console.log(`  Domain "${domain}" already exists — skipped`);
    }
  }

  // 4. Seed an admin membership for initial access
  console.log("\n--- Seeding admin membership ---");
  const membershipsContainer = database.container("memberships");
  // You may want to replace this with your actual admin email
  const ADMIN_EMAIL = "admin@aleutfederal.com";
  const { resources: existingMembership } = await membershipsContainer.items
    .query({
      query:
        "SELECT c.id FROM c WHERE c.tenantId = @tenantId AND c.userEmail = @email",
      parameters: [
        { name: "@tenantId", value: DEFAULT_TENANT_ID },
        { name: "@email", value: ADMIN_EMAIL },
      ],
    })
    .fetchAll();

  if (existingMembership.length === 0) {
    await membershipsContainer.items.create({
      id: uuidv4(),
      tenantId: DEFAULT_TENANT_ID,
      userEmail: ADMIN_EMAIL,
      role: "admin",
      source: "explicit",
      addedAt: new Date().toISOString(),
      addedBy: "setup-script",
      isActive: true,
    });
    console.log(
      `  Created admin membership: ${ADMIN_EMAIL} -> ${DEFAULT_TENANT_ID}`
    );
  } else {
    console.log(`  Admin membership already exists — skipped`);
  }

  console.log("\n=== Setup complete ===");
  console.log("\nRemaining manual steps:");
  console.log(
    "  1. Set NEXT_PUBLIC_BASE_URL in App Service config (Azure Portal > mymedia-app > Configuration)"
  );
  console.log(
    '     Value: "https://mymedia-app.azurewebsites.us" (or custom domain once configured)'
  );
  console.log(
    "  2. Verify Graph auth — does managed identity have Mail.Send, or do you need MailSenderCert?"
  );
  console.log(
    "  3. Replace self-signed TLS cert on App Gateway once custom domain is confirmed"
  );
}

main().catch((err) => {
  console.error("\nSetup failed:", err);
  process.exit(1);
});
