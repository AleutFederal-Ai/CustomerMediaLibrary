import { NextRequest, NextResponse } from "next/server";
import { auditLogs } from "@/lib/azure/cosmos";
import { isSuperAdmin } from "@/lib/auth/permissions";
import { AuditLogRecord } from "@/types";

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const email = request.headers.get("x-session-email");
  if (!email) return false;
  return isSuperAdmin(email);
}

// GET /api/admin/audit?from=<ISO>&to=<ISO>&action=<action>&email=<email>&ip=<ip>&cursor=<token>&format=json|csv
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const action = searchParams.get("action");
  const emailFilter = searchParams.get("email");
  const ipFilter = searchParams.get("ip");
  const format = searchParams.get("format") ?? "json";
  const continuationToken = searchParams.get("cursor") ?? undefined;

  const conditions: string[] = [];
  const parameters: { name: string; value: string }[] = [];

  if (from) {
    conditions.push("c.timestamp >= @from");
    parameters.push({ name: "@from", value: from });
  }

  if (to) {
    conditions.push("c.timestamp <= @to");
    parameters.push({ name: "@to", value: to });
  }

  if (action) {
    conditions.push("c.action = @action");
    parameters.push({ name: "@action", value: action });
  }

  if (emailFilter) {
    conditions.push("CONTAINS(c.userEmail, @email)");
    parameters.push({ name: "@email", value: emailFilter.toLowerCase() });
  }

  if (ipFilter) {
    conditions.push("CONTAINS(c.ipAddress, @ip)");
    parameters.push({ name: "@ip", value: ipFilter });
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `SELECT * FROM c ${where} ORDER BY c.timestamp DESC`;

  try {
    const container = await auditLogs();

    if (format === "csv") {
      // Fetch all records for CSV export (bounded by 90-day TTL)
      const { resources } = await container.items
        .query<AuditLogRecord>({ query, parameters })
        .fetchAll();

      const csv = buildCsv(resources);

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const iterator = container.items.query<AuditLogRecord>(
      { query, parameters },
      { maxItemCount: 100, continuationToken }
    );

    const page = await iterator.fetchNext();

    return NextResponse.json({
      items: page.resources,
      continuationToken: page.continuationToken ?? null,
    });
  } catch (err) {
    console.error("[admin/audit] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load audit logs" },
      { status: 500 }
    );
  }
}

function buildCsv(records: AuditLogRecord[]): string {
  const header = "timestamp,userEmail,ipAddress,action,tenantId,detail\r\n";
  const rows = records
    .map((r) => {
      const detail = JSON.stringify(r.detail).replace(/"/g, '""');
      return `"${r.timestamp}","${r.userEmail}","${r.ipAddress}","${r.action}","${r.tenantId ?? ""}","${detail}"`;
    })
    .join("\r\n");
  return header + rows;
}
