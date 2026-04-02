import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { domains } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { DomainRecord, AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i;

async function requireTenantAdmin(
  request: NextRequest
): Promise<{ email: string; tenantId: string } | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) return null;
  const ok = await isTenantAdmin(email, tenantId);
  return ok ? { email, tenantId } : null;
}

// GET /api/admin/domains — list domains for the active tenant
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.domains.GET.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.addedAt DESC",
        parameters: [{ name: "@tenantId", value: caller.tenantId }],
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    logError("admin.domains.GET.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to load domains" }, { status: 500 });
  }
}

// POST /api/admin/domains — add a domain to the active tenant
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.domains.POST.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { domain?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const domain = (body.domain ?? "").toLowerCase().trim();

  if (!domain || !DOMAIN_RE.test(domain)) {
    return NextResponse.json(
      { error: "Invalid domain format" },
      { status: 400 }
    );
  }

  try {
    const container = await domains();

    // Check for duplicate within this tenant
    const { resources: existing } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c WHERE c.domain = @domain AND c.tenantId = @tenantId",
        parameters: [
          { name: "@domain", value: domain },
          { name: "@tenantId", value: caller.tenantId },
        ],
      })
      .fetchAll();

    if (existing.length > 0) {
      const dup = existing[0];
      if (dup.isActive) {
        return NextResponse.json(
          { error: "Domain already exists" },
          { status: 409 }
        );
      }
      // Re-activate if it was previously deactivated
      await container.item(dup.id, dup.id).patch([
        { op: "replace", path: "/isActive", value: true },
        { op: "replace", path: "/addedAt", value: new Date().toISOString() },
        { op: "replace", path: "/addedBy", value: caller.email },
      ]);

      await writeAuditLog({
        userEmail: caller.email,
        ipAddress: ip,
        tenantId: caller.tenantId,
        action: AuditAction.DOMAIN_ADDED,
        detail: { domain, reactivated: true },
      });

      return NextResponse.json({ ...dup, isActive: true });
    }

    const record: DomainRecord = {
      id: uuidv4(),
      domain,
      tenantId: caller.tenantId,
      addedAt: new Date().toISOString(),
      addedBy: caller.email,
      isActive: true,
    };

    await container.items.create(record);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.DOMAIN_ADDED,
      detail: { domain },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    logError("admin.domains.POST.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to add domain" }, { status: 500 });
  }
}

// DELETE /api/admin/domains?id=<id> — deactivate a domain
async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.domains.DELETE.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c WHERE c.id = @id AND c.tenantId = @tenantId",
        parameters: [
          { name: "@id", value: id },
          { name: "@tenantId", value: caller.tenantId },
        ],
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const record = resources[0];
    await container.item(record.id, record.id).patch([
      { op: "replace", path: "/isActive", value: false },
    ]);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.DOMAIN_DEACTIVATED,
      detail: { domain: record.domain },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("admin.domains.DELETE.error", { tenantId: caller.tenantId, domainId: id, error: err });
    return NextResponse.json({ error: "Failed to deactivate domain" }, { status: 500 });
  }
}

export const GET = withRouteLogging("admin.domains.GET", handleGet);
export const POST = withRouteLogging("admin.domains.POST", handlePost);
export const DELETE = withRouteLogging("admin.domains.DELETE", handleDelete);
