/**
 * Dev/Docker seed script
 * Creates the Cosmos DB database + all containers, blob storage containers,
 * and seeds the domain allowlist.
 *
 * Run via: docker compose run --rm seed
 * Or locally: npx tsx scripts/seed-dev.ts
 */

import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import { v4 as uuidv4 } from "uuid";

const COSMOS_CS =
  process.env.COSMOS_CONNECTION_STRING ??
  "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;";

const BLOB_CS =
  process.env.AZURE_STORAGE_CONNECTION_STRING ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;";

const DB_NAME = "mediagallery";

// Container definitions — name + partition key path
const COSMOS_CONTAINERS = [
  { name: "sessions",    partitionKey: "/id" },
  { name: "users",       partitionKey: "/id" },
  { name: "albums",      partitionKey: "/id" },
  { name: "media",       partitionKey: "/id" },
  { name: "auditlogs",   partitionKey: "/id" },
  { name: "domains",     partitionKey: "/id" },
  { name: "tenants",     partitionKey: "/id" },
  { name: "memberships", partitionKey: "/id" },
];

const BLOB_CONTAINERS = ["media", "thumbnails"];

// Default tenant seeded for dev
const DEFAULT_TENANT_ID = "tenant-aleutfederal";
const DEFAULT_TENANT = {
  id: DEFAULT_TENANT_ID,
  name: "Aleut Federal",
  slug: "aleutfederal",
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "seed-script",
};

// Sample albums for dev UI testing
const SEED_ALBUMS = [
  { name: "2024 Annual Conference", description: "Photos and video from the Anchorage leadership summit.", order: 1 },
  { name: "Arctic Operations — Q1 2025", description: "Field documentation from northern deployment.", order: 2 },
  { name: "Training & Readiness", description: "Exercises, certifications, and team building events.", order: 3 },
];

// Initial permitted domains — all map to the default tenant
const SEED_DOMAINS = [
  "aleutfederal.com",
  "aleutfederal.us",
  "us.af.mil",
  "ussf.mil",
];

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 20): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === 503 && attempt < maxAttempts) {
        const wait = Math.min(attempt * 3000, 30000);
        console.log(`   ⏳ ${label} — emulator busy (503), retrying in ${wait / 1000}s (attempt ${attempt}/${maxAttempts})…`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts`);
}

async function seedCosmos() {
  console.log("⏳ Connecting to Cosmos DB emulator…");
  const client = new CosmosClient(COSMOS_CS);

  // Create database — retry until emulator is fully ready
  const { database } = await withRetry(
    () => client.databases.createIfNotExists({ id: DB_NAME }),
    `database "${DB_NAME}"`
  );
  console.log(`✅ Database "${DB_NAME}" ready`);

  // Create containers — retry each one individually
  for (const def of COSMOS_CONTAINERS) {
    await withRetry(
      () => database.containers.createIfNotExists({
        id: def.name,
        partitionKey: { paths: [def.partitionKey] },
      }),
      `container "${def.name}"`
    );
    console.log(`   ✅ Container "${def.name}" ready`);
  }

  // Seed default tenant
  const tenantsContainer = database.container("tenants");
  const { resources: existingTenants } = await tenantsContainer.items
    .query({ query: "SELECT c.id FROM c WHERE c.id = @id", parameters: [{ name: "@id", value: DEFAULT_TENANT_ID }] })
    .fetchAll();
  if (existingTenants.length === 0) {
    await tenantsContainer.items.create(DEFAULT_TENANT);
    console.log(`   ✅ Tenant "Aleut Federal" seeded (id: ${DEFAULT_TENANT_ID})`);
  } else {
    console.log(`   ⏭  Tenant already exists`);
  }

  // Seed sample albums
  const albumsContainer = database.container("albums");
  for (const album of SEED_ALBUMS) {
    const { resources: existing } = await albumsContainer.items
      .query({ query: "SELECT c.id FROM c WHERE c.name = @name AND c.tenantId = @tenantId",
        parameters: [{ name: "@name", value: album.name }, { name: "@tenantId", value: DEFAULT_TENANT_ID }] })
      .fetchAll();
    if (existing.length === 0) {
      const now = new Date().toISOString();
      await albumsContainer.items.create({
        id: uuidv4(),
        tenantId: DEFAULT_TENANT_ID,
        name: album.name,
        description: album.description,
        order: album.order,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`   ✅ Album "${album.name}" seeded`);
    } else {
      console.log(`   ⏭  Album "${album.name}" already exists`);
    }
  }

  // Seed domains — each mapped to the default tenant
  const domainsContainer = database.container("domains");
  for (const domain of SEED_DOMAINS) {
    const { resources } = await domainsContainer.items
      .query({
        query: "SELECT c.id FROM c WHERE c.domain = @domain",
        parameters: [{ name: "@domain", value: domain }],
      })
      .fetchAll();

    if (resources.length === 0) {
      await domainsContainer.items.create({
        id: uuidv4(),
        domain,
        tenantId: DEFAULT_TENANT_ID,
        addedAt: new Date().toISOString(),
        addedBy: "seed-script",
        isActive: true,
      });
      console.log(`   ✅ Domain "${domain}" → tenant "${DEFAULT_TENANT_ID}" seeded`);
    } else {
      console.log(`   ⏭  Domain "${domain}" already exists`);
    }
  }
}

async function seedBlob() {
  console.log("\n⏳ Connecting to Azurite…");
  const client = BlobServiceClient.fromConnectionString(BLOB_CS);

  for (const name of BLOB_CONTAINERS) {
    const containerClient = client.getContainerClient(name);
    const created = await containerClient.createIfNotExists();
    if (created.succeeded) {
      console.log(`✅ Blob container "${name}" created`);
    } else {
      console.log(`⏭  Blob container "${name}" already exists`);
    }
  }
}

async function main() {
  console.log("🌱 Media Gallery — dev seed script\n");

  try {
    await seedCosmos();
    await seedBlob();
    console.log("\n✅ Seed complete. You can now start the app.");
  } catch (err) {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  }
}

main();
