/**
 * Dev/Docker seed script
 * Creates the Cosmos DB database + all containers, blob storage containers,
 * and seeds the domain allowlist, tenants, and admin user.
 *
 * Run via: docker compose run --rm seed
 * Or locally: npx tsx scripts/seed-dev.ts
 */

import crypto from "crypto";
import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import { v4 as uuidv4 } from "uuid";

const COSMOS_CS =
  process.env.COSMOS_CONNECTION_STRING ??
  "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;";

const BLOB_CS =
  process.env.AZURE_STORAGE_CONNECTION_STRING ??
  "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;";

// Must match cosmos.ts DB_NAME
const DB_NAME = "mymedia";

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

// ── Tenants ───────────────────────────────────────────────────────────────────

const DEFAULT_TENANT_ID = "tenant-aleutfederal";

const SEED_TENANTS = [
  {
    id: DEFAULT_TENANT_ID,
    name: "Aleut Federal",
    slug: "aleutfederal",
    isActive: true,
    isPublic: false,
    description: "Aleut Federal default organization",
    brandColor: "#1e3a5f",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "seed-script",
  },
  {
    id: "22ab2f21-1165-4832-9664-170486c2cc73",
    name: "AF-Pub-TEST",
    slug: "af-pub-test",
    isActive: true,
    isPublic: true,
    description: "Aleut Federal public test organization",
    brandColor: "#1e3a5f",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "seed-script",
  },
  {
    id: "984276a2-3188-471e-8f0d-522b8647d159",
    name: "AF-Pri-TEST",
    slug: "af-pri-test",
    isActive: true,
    isPublic: false,
    description: "Aleut Federal private test organization",
    brandColor: "#1e3a5f",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "seed-script",
  },
];

// ── Albums ────────────────────────────────────────────────────────────────────

const SEED_ALBUMS = [
  { name: "2024 Annual Conference", description: "Photos and video from the Anchorage leadership summit.", order: 1 },
  { name: "Arctic Operations — Q1 2025", description: "Field documentation from northern deployment.", order: 2 },
  { name: "Training & Readiness", description: "Exercises, certifications, and team building events.", order: 3 },
];

// ── Domains ───────────────────────────────────────────────────────────────────

// Maps email domains to the default tenant
const SEED_DOMAINS = [
  "aleutfederal.com",
  "aleutfederal.us",
  "us.af.mil",
  "ussf.mil",
];

// ── Admin user ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "admin@admin.com";
// Dev-only password — clearly documented, never used in production
const ADMIN_DEV_PASSWORD = "Admin1234!";

const PBKDF2_ITERATIONS = 310_000;
const PBKDF2_KEY_LEN = 32;
const PBKDF2_DIGEST = "sha256";

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash.toString("hex")}`;
}

// ── Retry helper ──────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 20): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e?.code === 503 && attempt < maxAttempts) {
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

// ── Seed functions ────────────────────────────────────────────────────────────

async function seedCosmos() {
  console.log("⏳ Connecting to Cosmos DB emulator…");
  const client = new CosmosClient(COSMOS_CS);

  const { database } = await withRetry(
    () => client.databases.createIfNotExists({ id: DB_NAME }),
    `database "${DB_NAME}"`
  );
  console.log(`✅ Database "${DB_NAME}" ready`);

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

  // Seed tenants
  console.log("\n⏳ Seeding tenants…");
  const tenantsContainer = database.container("tenants");
  for (const tenant of SEED_TENANTS) {
    const { resources: existing } = await tenantsContainer.items
      .query({ query: "SELECT c.id FROM c WHERE c.id = @id", parameters: [{ name: "@id", value: tenant.id }] })
      .fetchAll();
    if (existing.length === 0) {
      await tenantsContainer.items.create(tenant);
      const visibility = tenant.isPublic ? "public" : "private";
      console.log(`   ✅ Tenant "${tenant.name}" (${tenant.slug}, ${visibility}) seeded`);
    } else {
      console.log(`   ⏭  Tenant "${tenant.name}" already exists`);
    }
  }

  // Seed sample albums (scoped to default tenant)
  console.log("\n⏳ Seeding albums…");
  const albumsContainer = database.container("albums");
  for (const album of SEED_ALBUMS) {
    const { resources: existing } = await albumsContainer.items
      .query({
        query: "SELECT c.id FROM c WHERE c.name = @name AND c.tenantId = @tenantId",
        parameters: [{ name: "@name", value: album.name }, { name: "@tenantId", value: DEFAULT_TENANT_ID }],
      })
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

  // Seed domains (mapped to default tenant)
  console.log("\n⏳ Seeding domains…");
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
      console.log(`   ✅ Domain "${domain}" → tenant "${DEFAULT_TENANT_ID}"`);
    } else {
      console.log(`   ⏭  Domain "${domain}" already exists`);
    }
  }

  // Seed admin@admin.com user + membership
  console.log("\n⏳ Seeding admin user…");
  const usersContainer = database.container("users");
  const { resources: existingAdmin } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: ADMIN_EMAIL }],
    })
    .fetchAll();

  console.log("   ⏳ Hashing admin password (this takes a moment)…");
  const passwordHash = await hashPassword(ADMIN_DEV_PASSWORD);
  const now = new Date().toISOString();

  if (existingAdmin.length === 0) {
    await usersContainer.items.create({
      id: uuidv4(),
      email: ADMIN_EMAIL,
      firstLoginAt: now,
      lastLoginAt: now,
      loginCount: 0,
      isBlocked: false,
      passwordHash,
    });
    console.log(`   ✅ User "${ADMIN_EMAIL}" created`);
  } else {
    await usersContainer.item(existingAdmin[0].id, existingAdmin[0].id).patch([
      { op: "replace", path: "/passwordHash", value: passwordHash },
    ]);
    console.log(`   ✅ User "${ADMIN_EMAIL}" password reset`);
  }

  // Give admin@admin.com explicit membership in the default tenant (admin role)
  const membershipsContainer = database.container("memberships");
  const { resources: existingMembership } = await membershipsContainer.items
    .query({
      query: "SELECT c.id FROM c WHERE c.userEmail = @email AND c.tenantId = @tenantId",
      parameters: [
        { name: "@email", value: ADMIN_EMAIL },
        { name: "@tenantId", value: DEFAULT_TENANT_ID },
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
      addedAt: now,
      addedBy: "seed-script",
      isActive: true,
    });
    console.log(`   ✅ Membership: "${ADMIN_EMAIL}" → "${DEFAULT_TENANT_ID}" (admin)`);
  } else {
    console.log(`   ⏭  Membership for "${ADMIN_EMAIL}" already exists`);
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

    console.log(`
┌──────────────────────────────────────────────────┐
│         DEV CREDENTIALS (local only)             │
├──────────────────────────────────────────────────┤
│  Super Admin                                     │
│  Email:    admin@admin.com                       │
│  Password: Admin1234!                            │
│  Login:    Password tab → no org needed          │
│            (Platform Administration)             │
├──────────────────────────────────────────────────┤
│  Dev bypass user (DOCKER_DEV=true only)          │
│  Email:    dev@aleutfederal.com                  │
│  Cookie:   dev_bypass=1                          │
└──────────────────────────────────────────────────┘`);

    console.log("\n✅ Seed complete. You can now start the app.");
  } catch (err) {
    console.error("\n❌ Seed failed:", err);
    process.exit(1);
  }
}

main();
