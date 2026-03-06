import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { albums, media } from "@/lib/azure/cosmos";
import { deleteBlob } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { AlbumRecord, MediaRecord, AuditAction } from "@/types";

/** Returns { email, tenantId } if the caller can manage the target tenant, null otherwise. */
async function requireTenantAdmin(
  request: NextRequest
): Promise<{ email: string; tenantId: string } | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  // Super admins may pass ?tenantId= to target any tenant; others use their active tenant
  const tenantId =
    request.nextUrl.searchParams.get("tenantId") ||
    request.headers.get("x-active-tenant-id") ||
    "";
  if (!tenantId) return null;
  const ok = await isTenantAdmin(email, tenantId);
  return ok ? { email, tenantId } : null;
}

// GET /api/admin/albums — list albums for the active (or specified) tenant
export async function GET(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const container = await albums();
    const { resources } = await container.items
      .query<AlbumRecord>({
        query: "SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c['order'] ASC",
        parameters: [{ name: "@tenantId", value: caller.tenantId }],
      })
      .fetchAll();

    return NextResponse.json(resources);
  } catch (err) {
    console.error("[admin/albums] GET error:", err);
    return NextResponse.json({ error: "Failed to load albums" }, { status: 500 });
  }
}

// POST /api/admin/albums — create album
export async function POST(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { name?: string; description?: string; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const album: AlbumRecord = {
    id: uuidv4(),
    tenantId: caller.tenantId,
    name,
    description: body.description?.trim(),
    order: body.order ?? 0,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };

  try {
    const container = await albums();
    const { resource: created } = await container.items.create(album);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.ALBUM_CREATED,
      detail: { albumId: album.id, name },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[admin/albums] POST error:", err);
    return NextResponse.json({ error: "Failed to create album" }, { status: 500 });
  }
}

// PATCH /api/admin/albums?id=<id> — update album
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: Partial<Pick<AlbumRecord, "name" | "description" | "order" | "coverMediaId">>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const container = await albums();
    const { resource: existing } = await container.item(id, id).read<AlbumRecord>();
    if (!existing || existing.tenantId !== caller.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated: AlbumRecord = {
      ...existing,
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() }),
      ...(body.order !== undefined && { order: body.order }),
      ...(body.coverMediaId !== undefined && { coverMediaId: body.coverMediaId }),
      updatedAt: new Date().toISOString(),
    };

    const { resource: result } = await container.item(id, id).replace(updated);

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.ALBUM_UPDATED,
      detail: { albumId: id, changes: body },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/albums] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update album" }, { status: 500 });
  }
}

// DELETE /api/admin/albums?id=<id> — soft delete album and its media
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const albumsContainer = await albums();
    const { resource: existing } = await albumsContainer.item(id, id).read<AlbumRecord>();
    if (!existing || existing.tenantId !== caller.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Soft-delete the album
    await albumsContainer.item(id, id).replace({ ...existing, isDeleted: true, updatedAt: now });

    // Soft-delete all media in the album
    const mediaContainer = await media();
    const { resources: mediaItems } = await mediaContainer.items
      .query<MediaRecord>({
        query: "SELECT * FROM c WHERE c.albumId = @albumId AND c.tenantId = @tenantId AND c.isDeleted = false",
        parameters: [
          { name: "@albumId", value: id },
          { name: "@tenantId", value: caller.tenantId },
        ],
      })
      .fetchAll();

    await Promise.all(
      mediaItems.map((item) =>
        mediaContainer.item(item.id, item.albumId).replace({
          ...item,
          isDeleted: true,
          deletedAt: now,
          deletedBy: caller.email,
        })
      )
    );

    await writeAuditLog({
      userEmail: caller.email,
      ipAddress: ip,
      tenantId: caller.tenantId,
      action: AuditAction.ALBUM_DELETED,
      detail: { albumId: id, mediaCount: mediaItems.length },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/albums] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete album" }, { status: 500 });
  }
}
