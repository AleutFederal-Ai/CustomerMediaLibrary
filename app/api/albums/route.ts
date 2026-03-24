import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit/logger";
import { listAlbumItemsForTenant } from "@/lib/gallery/albums";
import { AuditAction } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email") ?? "unknown";
  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  try {
    const items = await listAlbumItemsForTenant(tenantId);

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      tenantId,
      action: AuditAction.ALBUM_VIEWED,
      detail: { albumCount: items.length },
    });

    return NextResponse.json(items);
  } catch (err) {
    console.error("[albums] GET error:", err);
    return NextResponse.json({ error: "Failed to load albums" }, { status: 500 });
  }
}
