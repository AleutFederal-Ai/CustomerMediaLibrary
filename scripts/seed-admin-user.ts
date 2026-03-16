/**
 * Seed an admin@admin.com user with a password for testing.
 *
 * Creates a UserRecord in the `users` container and sets a PBKDF2 password hash.
 * If the user already exists, it resets the password only.
 *
 * Prerequisites (production):
 *   az cloud set --name AzureUSGovernment
 *   az login --tenant 8b37dad1-f014-4751-907b-9c53d310a45f
 *
 * Run: npx tsx scripts/seed-admin-user.ts
 * Run with custom password: SEED_PASSWORD=mypassword npx tsx scripts/seed-admin-user.ts
 */

import crypto from "crypto";
import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import type { TokenCredential, GetTokenOptions, AccessToken } from "@azure/core-auth";
import { v4 as uuidv4 } from "uuid";

// ── Config ────────────────────────────────────────────────────────────────────

const TARGET_EMAIL = "admin@admin.com";
const DB_NAME = "mymedia";
const COSMOS_ENDPOINT = "https://mymedia-cosmos.documents.azure.us:443/";

// ── Credential wrapper (same as cosmos.ts) ───────────────────────────────────

class GcchCosmosCredential implements TokenCredential {
  constructor(private readonly inner: TokenCredential) {}
  getToken(_scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken | null> {
    return this.inner.getToken("https://cosmos.azure.com/.default", options);
  }
}

// ── Password hashing (mirrors lib/auth/password.ts) ──────────────────────────

const ITERATIONS = 310_000;
const KEY_LEN = 32;
const DIGEST = "sha256";

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LEN, DIGEST, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
  return `pbkdf2$${ITERATIONS}$${salt}$${hash.toString("hex")}`;
}

function generatePassword(): string {
  // 20 chars: uppercase + lowercase + digits + symbols — no ambiguous chars
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  return Array.from(crypto.randomBytes(20))
    .map((b) => charset[b % charset.length])
    .join("");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Media Gallery — Admin User Seed ===\n");

  const password = process.env.SEED_PASSWORD ?? generatePassword();

  console.log("Connecting to Cosmos DB (GCCH)…");
  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });

  const client = new CosmosClient({
    endpoint: COSMOS_ENDPOINT,
    aadCredentials: new GcchCosmosCredential(credential),
  });

  const db = client.database(DB_NAME);
  const usersContainer = db.container("users");

  // Check if user already exists
  const { resources: existing } = await usersContainer.items
    .query({
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: TARGET_EMAIL }],
    })
    .fetchAll();

  console.log("Hashing password… (this takes a moment)");
  const passwordHash = await hashPassword(password);

  const now = new Date().toISOString();

  if (existing.length > 0) {
    const user = existing[0];
    await usersContainer.item(user.id, user.id).patch([
      { op: "replace", path: "/passwordHash", value: passwordHash },
    ]);
    console.log(`\n✅ Password reset for existing user: ${TARGET_EMAIL}`);
  } else {
    await usersContainer.items.create({
      id: uuidv4(),
      email: TARGET_EMAIL,
      firstLoginAt: now,
      lastLoginAt: now,
      loginCount: 0,
      isBlocked: false,
      passwordHash,
    });
    console.log(`\n✅ User created: ${TARGET_EMAIL}`);
  }

  console.log("\n┌─────────────────────────────────────────────┐");
  console.log("│         LOGIN CREDENTIALS (save these)      │");
  console.log("├─────────────────────────────────────────────┤");
  console.log(`│  Email:    ${TARGET_EMAIL.padEnd(34)}│`);
  console.log(`│  Password: ${password.padEnd(34)}│`);
  console.log("└─────────────────────────────────────────────┘");

  console.log(`
⚠  ADMIN ACCESS NOTE
   This user can log in via the Password tab.
   Admin routes (/admin/*) require the email to be a member
   of the MediaGallery-Admins Entra ID group.
   admin@admin.com is not a real Entra account, so admin
   routes will be inaccessible unless you add a dev bypass
   (ask Claude to add one to lib/azure/graph.ts).
`);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
