import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { sessions, users } from "@/lib/azure/cosmos";
import { getSecret } from "@/lib/azure/keyvault";
import { logError, logWarn, logInfo } from "@/lib/logging/structured";
import { SessionRecord } from "@/types";

const TOKEN_EXPIRY_MINUTES = 10;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 5;

/**
 * Hash a raw token with SHA-256 for storage.
 * Only the hash is stored — the raw token is sent to the user.
 */
export function hashToken(rawToken: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(rawToken)
    .digest("hex");
}

/**
 * Generate a cryptographically secure magic link token.
 * Stores the hash in Cosmos DB. Returns the raw token to be included in the URL.
 */
export async function generateMagicLinkToken(
  email: string,
  ipAddress: string
): Promise<string> {
  const secret = await getSecret("MagicLinkSigningSecret");
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken, secret);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // TTL slightly longer than expiry to ensure Cosmos auto-cleanup
  const ttl = (TOKEN_EXPIRY_MINUTES + 5) * 60;

  const record: SessionRecord = {
    id: tokenHash,
    type: "magic-link",
    email: email.toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ipAddress,
    ttl,
  };

  const container = await sessions();
  await container.items.create(record);

  return rawToken;
}

/**
 * Validate and consume a magic link token.
 * Returns the email on success, null on failure.
 * Marks the token as used (does not delete it).
 */
export async function validateMagicLinkToken(
  rawToken: string,
  ipAddress: string
): Promise<string | null> {
  // Step 1: Hash the incoming token
  let secret: string;
  let tokenHash: string;
  try {
    secret = await getSecret("MagicLinkSigningSecret");
    tokenHash = hashToken(rawToken, secret);
  } catch (err) {
    logError("magic-link.validate.secret_failed", {
      error: err,
      hint: "Could not retrieve MagicLinkSigningSecret from Key Vault",
    });
    return null;
  }

  // Step 2: Look up the token record in Cosmos DB
  let container: Awaited<ReturnType<typeof sessions>>;
  let record: SessionRecord | undefined;
  try {
    container = await sessions();
    const result = await container
      .item(tokenHash, tokenHash)
      .read<SessionRecord>();
    record = result.resource;
  } catch (err) {
    logError("magic-link.validate.cosmos_read_failed", {
      error: err,
      tokenHashPrefix: tokenHash.slice(0, 8),
      hint: "Cosmos DB read failed — may be a connectivity or auth issue",
    });
    return null;
  }

  // Step 3: Validate the record
  if (!record) {
    logWarn("magic-link.validate.not_found", {
      tokenHashPrefix: tokenHash.slice(0, 8),
      hint: "No document with this token hash exists in sessions container",
    });
    return null;
  }

  if (record.type !== "magic-link") {
    logWarn("magic-link.validate.wrong_type", {
      type: record.type,
      tokenHashPrefix: tokenHash.slice(0, 8),
    });
    return null;
  }

  if (record.usedAt) {
    logWarn("magic-link.validate.already_used", {
      email: record.email,
      usedAt: record.usedAt,
    });
    return null;
  }

  const now = new Date();
  if (now > new Date(record.expiresAt)) {
    logWarn("magic-link.validate.expired", {
      email: record.email,
      expiresAt: record.expiresAt,
      now: now.toISOString(),
    });
    return null;
  }

  // Step 4: Check if user is blocked
  try {
    const usersContainer = await users();
    const { resources: userRecords } = await usersContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email AND c.isBlocked = true",
        parameters: [{ name: "@email", value: record.email }],
      })
      .fetchAll();

    if (userRecords.length > 0) {
      logWarn("magic-link.validate.user_blocked", { email: record.email });
      return null;
    }
  } catch (err) {
    logError("magic-link.validate.blocked_check_failed", {
      email: record.email,
      error: err,
    });
    // Fail closed — if we can't verify the user isn't blocked, deny access
    return null;
  }

  // Step 5: Mark token as used (best-effort — do not fail the login if this errors)
  try {
    await container.item(tokenHash, tokenHash).replace<SessionRecord>({
      ...record,
      usedAt: now.toISOString(),
    });
  } catch (err) {
    // Log but continue — the token is valid and the 10-minute expiry + TTL
    // will clean up the record. Failing here should NOT block the user.
    logError("magic-link.validate.mark_used_failed", {
      email: record.email,
      error: err,
      hint: "Token is valid but could not be marked as used — login will proceed",
    });
  }

  logInfo("magic-link.validate.success", { email: record.email });
  return record.email;
}

/**
 * Check and increment rate limit for magic link requests.
 * Returns true if the request is within limits, false if rate limited.
 * Uses a counter stored in Cosmos DB sessions container.
 */
export async function checkRateLimit(
  email: string,
  ipAddress: string
): Promise<boolean> {
  try {
    const emailHash = crypto
      .createHash("sha256")
      .update(email.toLowerCase())
      .digest("hex");

    const windowKey = `ratelimit:${emailHash}`;
    const ipKey = `ratelimit:ip:${crypto.createHash("sha256").update(ipAddress).digest("hex")}`;

    const container = await sessions();
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
    );

    // Check email rate limit
    const emailAllowed = await checkAndIncrementCounter(
      container,
      windowKey,
      RATE_LIMIT_MAX_REQUESTS,
      windowStart,
      now
    );

    // Check IP rate limit (20 per 15 min)
    const ipAllowed = await checkAndIncrementCounter(
      container,
      ipKey,
      20,
      windowStart,
      now
    );

    return emailAllowed && ipAllowed;
  } catch {
    // On error, allow through — do not block legitimate users
    return true;
  }
}

interface RateLimitRecord {
  id: string;
  type: "rate-limit";
  count: number;
  windowStart: string;
  expiresAt: string;
  ipAddress: string;
  email: string;
  ttl: number;
}

async function checkAndIncrementCounter(
  container: Awaited<ReturnType<typeof sessions>>,
  key: string,
  maxRequests: number,
  windowStart: Date,
  now: Date
): Promise<boolean> {
  const ttlSeconds = RATE_LIMIT_WINDOW_MINUTES * 60 + 60;

  try {
    const { resource: existing } = await container
      .item(key, key)
      .read<RateLimitRecord>();

    if (existing && new Date(existing.windowStart) > windowStart) {
      // Still within the current window
      if (existing.count >= maxRequests) return false;

      await container.item(key, key).replace<RateLimitRecord>({
        ...existing,
        count: existing.count + 1,
      });
      return true;
    }
    // Window expired — reset
  } catch {
    // Record doesn't exist — create it
  }

  const expiresAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  await container.items.upsert<Partial<RateLimitRecord>>({
    id: key,
    type: "rate-limit",
    count: 1,
    windowStart: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl: ttlSeconds,
  });

  return true;
}
