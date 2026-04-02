import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { tenants } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { TenantRecord, AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

const SLUG_RE = /^[a-z0-9][a-z0-9\-]{0,62}[a-z0-9]$/;

async function requireSuperAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  return (await isSuperAdmin(email)) ? email : null;
}

// GET /api/admin/tenants — list all tenants
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const email = await requireSuperAdmin(request);
  if (!email) {
    const reqEmail = request.headers.get("x-session-email");
    logWarn("admin.tenants.GET.forbidden", { email: reqEmail, reason: "Not a super admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const container = await tenants();
    const { resources } = await container.items
      .query<TenantRecord>({
        query: "SELECT * FROM c ORDER BY c.name ASC",
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    logError("admin.tenants.GET.error", { error: err });
    return NextResponse.json({ error: "Failed to load tenants" }, { status: 500 });
  }
}

// POST /api/admin/tenants — create a new tenant
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = await requireSuperAdmin(request);
  if (!email) {
    const reqEmail = request.headers.get("x-session-email");
    logWarn("admin.tenants.POST.forbidden", { email: reqEmail, reason: "Not a super admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: {
    name?: string;
    slug?: string;
    isPublic?: boolean;
    description?: string;
    logoUrl?: string;
    brandColor?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const slug = (body.slug ?? "").toLowerCase().trim();

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "slug must be lowercase alphanumeric with hyphens" }, { status: 400 });
  }

  try {
    const container = await tenants();

    // Check slug uniqueness
    const { resources: existing } = await container.items
      .query<TenantRecord>({
        query: "SELECT c.id FROM c WHERE c.slug = @slug",
        parameters: [{ name: "@slug", value: slug }],
      })
      .fetchAll();

    if (existing.length > 0) {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const tenant: TenantRecord = {
      id: uuidv4(),
      name,
      slug,
      isActive: true,
      isPublic: body.isPublic ?? false,
      ...(body.description && { description: body.description.trim() }),
      ...(body.logoUrl && { logoUrl: body.logoUrl.trim() }),
      ...(body.brandColor && { brandColor: body.brandColor.trim() }),
      createdAt: now,
      updatedAt: now,
      createdBy: email,
    };

    const { resource: created } = await container.items.create(tenant);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.TENANT_CREATED,
      detail: { tenantId: tenant.id, name, slug },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    logError("admin.tenants.POST.error", { error: err });
    return NextResponse.json({ error: "Failed to create tenant" }, { status: 500 });
  }
}

// PATCH /api/admin/tenants?id=<id> — update tenant name
async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const email = await requireSuperAdmin(request);
  if (!email) {
    const reqEmail = request.headers.get("x-session-email");
    logWarn("admin.tenants.PATCH.forbidden", { email: reqEmail, reason: "Not a super admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: {
    name?: string;
    isPublic?: boolean;
    description?: string;
    logoUrl?: string;
    brandColor?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const container = await tenants();
    const { resource: existing } = await container.item(id, id).read<TenantRecord>();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated: TenantRecord = {
      ...existing,
      ...(body.name && { name: body.name.trim() }),
      ...(typeof body.isPublic === "boolean" && { isPublic: body.isPublic }),
      ...(body.description !== undefined && { description: body.description.trim() }),
      ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl.trim() }),
      ...(body.brandColor !== undefined && { brandColor: body.brandColor.trim() }),
      updatedAt: new Date().toISOString(),
    };

    const { resource: result } = await container.item(id, id).replace(updated);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.TENANT_UPDATED,
      detail: { tenantId: id, changes: body },
    });

    return NextResponse.json(result);
  } catch (err) {
    logError("admin.tenants.PATCH.error", { tenantId: id, error: err });
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}

// DELETE /api/admin/tenants?id=<id> — deactivate (soft delete) a tenant
async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const email = await requireSuperAdmin(request);
  if (!email) {
    const reqEmail = request.headers.get("x-session-email");
    logWarn("admin.tenants.DELETE.forbidden", { email: reqEmail, reason: "Not a super admin" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const container = await tenants();
    const { resource: existing } = await container.item(id, id).read<TenantRecord>();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await container.item(id, id).patch([
      { op: "replace", path: "/isActive", value: false },
      { op: "replace", path: "/updatedAt", value: new Date().toISOString() },
    ]);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.TENANT_DEACTIVATED,
      detail: { tenantId: id, name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("admin.tenants.DELETE.error", { tenantId: id, error: err });
    return NextResponse.json({ error: "Failed to deactivate tenant" }, { status: 500 });
  }
}

export const GET = withRouteLogging("admin.tenants.GET", handleGet);
export const POST = withRouteLogging("admin.tenants.POST", handlePost);
export const PATCH = withRouteLogging("admin.tenants.PATCH", handlePatch);
export const DELETE = withRouteLogging("admin.tenants.DELETE", handleDelete);
