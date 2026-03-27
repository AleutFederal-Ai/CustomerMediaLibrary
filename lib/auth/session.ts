import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { NextRequest, NextResponse } from "next/server";
import { sessions, users } from "@/lib/azure/cosmos";
import { getSecret } from "@/lib/azure/keyvault";
import { canAccessAdmin } from "@/lib/auth/admin";
import { getTenantById, getUserTenantIds } from "@/lib/auth/tenant";
import { SessionRecord, SessionContext } from "@/types";

const COOKIE_NAME = "mg_session";
const IDLE_TIMEOUT_MINUTES = 60;
const ABSOLUTE_TIMEOUT_HOURS = 8;

// ============================================================
// Cookie helpers
// ============================================================

/**
 * Cookie format: base64url(sessionId:email).<hmac-sha256-hex>
 * The HMAC covers the entire base64url payload so middleware can
 * verify the signature and extract the email without a Cosmos lookup.
 */
async function signCookiePayload(sessionId: string, email: string): Promise<string> {
  const payload = Buffer.from(`${sessionId}:${email}`).toString("base64url");
  const secret = await getSecret("SessionSigningSecret");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

/**
 * Verify the signed cookie and extract sessionId + email.
 * Returns null if the signature is invalid or the payload is malformed.
 */
async function verifySignedCookie(
  cookieValue: string
): Promise<{ sessionId: string; email: string } | null> {
  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = cookieValue.slice(0, lastDot);
  const providedSig = cookieValue.slice(lastDot + 1);

  const secret = await getSecret("SessionSigningSecret");
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (providedSig.length !== expectedSig.length) return null;

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(providedSig, "hex"), Buffer.from(expectedSig, "hex"))) {
    return null;
  }

  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return null;
    return {
      sessionId: decoded.slice(0, colonIdx),
      email: decoded.slice(colonIdx + 1),
    };
  } catch {
    return null;
  }
}

// ============================================================
// Session lifecycle
// ============================================================

/**
 * Session cookie options — defined once, used by createSession and
 * setSessionCookie to guarantee the exact same attributes every time.
 */
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ABSOLUTE_TIMEOUT_HOURS * 60 * 60,
};

/**
 * Create a new session after successful authentication.
 * Resolves tenant memberships for the user and stores them on the session.
 *
 * Does NOT set the cookie — returns the signed cookie value so the caller
 * can set it directly on their final response using `setSessionCookie()`.
 * This avoids the fragile temp-response cookie-copying pattern where
 * attributes (httpOnly, secure, sameSite) could be lost during round-trip.
 */
export async function createSession(
  email: string,
  ipAddress: string,
  preferredTenantId?: string
): Promise<{
  sessionId: string;
  tenantIds: string[];
  activeTenantId: string | undefined;
  signedCookieValue: string;
}> {
  const sessionId = uuidv4();
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MINUTES * 60 * 1000);
  const absoluteExpiresAt = new Date(
    now.getTime() + ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000
  );

  // TTL = absolute timeout + 1 hour buffer
  const ttl = ABSOLUTE_TIMEOUT_HOURS * 60 * 60 + 3600;

  // Resolve all tenants the user belongs to
  let tenantIds = await getUserTenantIds(email);
  const isPlatformAdmin = await canAccessAdmin(email);

  if (
    preferredTenantId &&
    !tenantIds.includes(preferredTenantId) &&
    isPlatformAdmin
  ) {
    const preferredTenant = await getTenantById(preferredTenantId);
    if (preferredTenant) {
      tenantIds = [...tenantIds, preferredTenantId];
    }
  }

  // Use the preferred tenant whenever the session is allowed to operate in it.
  const activeTenantId =
    preferredTenantId && tenantIds.includes(preferredTenantId)
      ? preferredTenantId
      : tenantIds[0] ?? undefined;

  const record: SessionRecord = {
    id: sessionId,
    type: "session",
    email: email.toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: idleExpiresAt.toISOString(),
    lastActiveAt: now.toISOString(),
    absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    ipAddress,
    ttl,
    activeTenantId,
    tenantIds,
  };

  const container = await sessions();
  await container.items.create(record);

  // Update user record (upsert)
  await updateUserRecord(email, now);

  const signedCookieValue = await signCookiePayload(sessionId, email.toLowerCase());

  return { sessionId, tenantIds, activeTenantId, signedCookieValue };
}

/**
 * Set the session cookie on a response. Always use this instead of
 * copying cookies between responses — it guarantees the exact attributes.
 */
export function setSessionCookie(response: NextResponse, signedCookieValue: string): void {
  response.cookies.set(COOKIE_NAME, signedCookieValue, SESSION_COOKIE_OPTIONS);
}

/**
 * Validate the session cookie from a request.
 * Extends the idle timeout on each valid request.
 * Returns SessionContext on success, null on failure.
 */
/**
 * Result of session validation.
 * - SessionContext: valid session
 * - null: definitely invalid (no cookie, bad signature, expired, blocked)
 * - "error": infrastructure failure (Cosmos/Key Vault) — caller should
 *   return 503, NOT treat as unauthorized
 */
export async function validateSession(
  request: NextRequest
): Promise<SessionContext | null | "error"> {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    console.warn("[session] no cookie present");
    return null;
  }

  let parsed: { sessionId: string; email: string } | null;
  try {
    parsed = await verifySignedCookie(cookieValue);
  } catch (err) {
    console.error("[session] Key Vault / HMAC error:", err);
    return "error";
  }
  if (!parsed) {
    console.warn("[session] cookie signature invalid");
    return null;
  }
  const { sessionId } = parsed;

  let container;
  try {
    container = await sessions();
  } catch (err) {
    console.error("[session] Cosmos sessions() error:", err);
    return "error";
  }

  let record: SessionRecord | undefined;
  try {
    const result = await container
      .item(sessionId, sessionId)
      .read<SessionRecord>();
    record = result.resource;
  } catch (err) {
    console.error("[session] Cosmos read error:", err);
    return "error";
  }

  if (!record || record.type !== "session") {
    console.warn("[session] record not found or wrong type, id:", sessionId);
    return null;
  }

  const now = new Date();

  // Check idle timeout
  if (now > new Date(record.expiresAt)) return null;

  // Check absolute timeout
  if (record.absoluteExpiresAt && now > new Date(record.absoluteExpiresAt)) {
    return null;
  }

  // Check if user is blocked
  try {
    const usersContainer = await users();
    const { resources: blockedRecords } = await usersContainer.items
      .query({
        query:
          "SELECT c.id FROM c WHERE c.email = @email AND c.isBlocked = true",
        parameters: [{ name: "@email", value: record.email }],
      })
      .fetchAll();

    if (blockedRecords.length > 0) return null;
  } catch {
    // If we can't check blocked status, don't kill the session — fail open
    // for availability. Blocked users will be caught on next successful check.
  }

  // Extend idle timeout (best-effort — don't fail the request if this errors)
  try {
    const newIdleExpiry = new Date(
      now.getTime() + IDLE_TIMEOUT_MINUTES * 60 * 1000
    );
    await container.item(sessionId, sessionId).patch([
      {
        op: "replace",
        path: "/expiresAt",
        value: newIdleExpiry.toISOString(),
      },
      {
        op: "replace",
        path: "/lastActiveAt",
        value: now.toISOString(),
      },
    ]);
  } catch {
    // Non-critical — session remains valid even if we can't extend it
  }

  return {
    sessionId,
    email: record.email,
    isAdmin: false, // Admin check done separately (cached per session)
    activeTenantId: record.activeTenantId ?? null,
    tenantIds: record.tenantIds ?? [],
    ...(record.impersonatedBy ? { impersonatedBy: record.impersonatedBy } : {}),
  };
}

/**
 * Switch the active tenant on a session.
 * The new tenantId must be in the session's tenantIds list.
 */
export async function switchActiveTenant(
  sessionId: string,
  tenantId: string,
  currentTenantIds: string[]
): Promise<boolean> {
  if (!currentTenantIds.includes(tenantId)) return false;

  try {
    const container = await sessions();
    await container.item(sessionId, sessionId).patch([
      { op: "replace", path: "/activeTenantId", value: tenantId },
      { op: "replace", path: "/tenantIds", value: currentTenantIds },
    ]);
    return true;
  } catch {
    return false;
  }
}


export async function beginUserImpersonation(
  sessionId: string,
  actorEmail: string,
  targetEmail: string,
  targetTenantId: string,
  targetTenantIds: string[],
  actorActiveTenantId?: string | null,
  actorTenantIds: string[] = []
): Promise<boolean> {
  try {
    const container = await sessions();
    await container.item(sessionId, sessionId).patch([
      { op: "replace", path: "/email", value: targetEmail.toLowerCase() },
      { op: "replace", path: "/activeTenantId", value: targetTenantId },
      { op: "replace", path: "/tenantIds", value: targetTenantIds },
      { op: "add", path: "/impersonatedBy", value: actorEmail.toLowerCase() },
      { op: "add", path: "/impersonatorActiveTenantId", value: actorActiveTenantId ?? null },
      { op: "add", path: "/impersonatorTenantIds", value: actorTenantIds },
      { op: "add", path: "/impersonatedAt", value: new Date().toISOString() },
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function endUserImpersonation(
  sessionId: string,
  impersonatorEmail: string,
  impersonatorActiveTenantId?: string | null,
  impersonatorTenantIds: string[] = []
): Promise<boolean> {
  try {
    const container = await sessions();
    await container.item(sessionId, sessionId).patch([
      { op: "replace", path: "/email", value: impersonatorEmail.toLowerCase() },
      { op: "replace", path: "/activeTenantId", value: impersonatorActiveTenantId ?? null },
      { op: "replace", path: "/tenantIds", value: impersonatorTenantIds },
      { op: "remove", path: "/impersonatedBy" },
      { op: "remove", path: "/impersonatorActiveTenantId" },
      { op: "remove", path: "/impersonatorTenantIds" },
      { op: "remove", path: "/impersonatedAt" },
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Invalidate a session (sign out).
 */
export async function revokeSession(
  sessionId: string,
  response: NextResponse
): Promise<void> {
  try {
    const container = await sessions();
    await container.item(sessionId, sessionId).patch([
      { op: "replace", path: "/expiresAt", value: new Date(0).toISOString() },
    ]);
  } catch {
    // Ignore — cookie will be cleared regardless
  }

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Get the cookie name (used in middleware to clear it).
 */
export const SESSION_COOKIE_NAME = COOKIE_NAME;

// ============================================================
// User record helpers
// ============================================================

async function updateUserRecord(email: string, loginAt: Date): Promise<void> {
  try {
    const container = await users();
    const emailLower = email.toLowerCase();

    const { resources: existing } = await container.items
      .query({
        query: "SELECT * FROM c WHERE c.email = @email",
        parameters: [{ name: "@email", value: emailLower }],
      })
      .fetchAll();

    if (existing.length > 0) {
      const user = existing[0];
      await container.item(user.id, user.id).patch([
        { op: "replace", path: "/lastLoginAt", value: loginAt.toISOString() },
        { op: "incr", path: "/loginCount", value: 1 },
      ]);
    } else {
      await container.items.create({
        id: uuidv4(),
        email: emailLower,
        firstLoginAt: loginAt.toISOString(),
        lastLoginAt: loginAt.toISOString(),
        loginCount: 1,
        isBlocked: false,
      });
    }
  } catch {
    // Do not fail login if user record update fails
  }
}
