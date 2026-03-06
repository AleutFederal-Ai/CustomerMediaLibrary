import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { domains } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { DomainRecord, AuditAction } from "@/types";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)+$/i;

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const isAdmin = await isAdminGroupMember(email);
  return isAdmin ? email : null;
}

// GET /api/admin/domains
export async function GET(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c ORDER BY c.addedAt DESC",
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    console.error("[admin/domains] GET error:", err);
    return NextResponse.json({ error: "Failed to load domains" }, { status: 500 });
  }
}

// POST /api/admin/domains — add a domain
export async function POST(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

    // Check for duplicate
    const { resources: existing } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c WHERE c.domain = @domain",
        parameters: [{ name: "@domain", value: domain }],
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
      await container.item(dup.id, dup.domain).patch([
        { op: "replace", path: "/isActive", value: true },
        { op: "replace", path: "/addedAt", value: new Date().toISOString() },
        { op: "replace", path: "/addedBy", value: adminEmail },
      ]);

      await writeAuditLog({
        userEmail: adminEmail,
        ipAddress: ip,
        action: AuditAction.DOMAIN_ADDED,
        detail: { domain, reactivated: true },
      });

      return NextResponse.json({ ...dup, isActive: true });
    }

    const record: DomainRecord = {
      id: uuidv4(),
      domain,
      addedAt: new Date().toISOString(),
      addedBy: adminEmail,
      isActive: true,
    };

    await container.items.create(record);

    await writeAuditLog({
      userEmail: adminEmail,
      ipAddress: ip,
      action: AuditAction.DOMAIN_ADDED,
      detail: { domain },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    console.error("[admin/domains] POST error:", err);
    return NextResponse.json({ error: "Failed to add domain" }, { status: 500 });
  }
}

// DELETE /api/admin/domains?id=<id> — deactivate a domain
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const adminEmail = await requireAdmin(request);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const container = await domains();
    const { resources } = await container.items
      .query<DomainRecord>({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: id }],
      })
      .fetchAll();

    if (resources.length === 0) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    const record = resources[0];
    await container.item(record.id, record.domain).patch([
      { op: "replace", path: "/isActive", value: false },
    ]);

    await writeAuditLog({
      userEmail: adminEmail,
      ipAddress: ip,
      action: AuditAction.DOMAIN_DEACTIVATED,
      detail: { domain: record.domain },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/domains] DELETE error:", err);
    return NextResponse.json({ error: "Failed to deactivate domain" }, { status: 500 });
  }
}
