import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { albums, media } from "@/lib/azure/cosmos";
import { deleteBlob } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isAdminGroupMember } from "@/lib/azure/graph";
import { AlbumRecord, MediaRecord, AuditAction } from "@/types";

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const email = request.headers.get("x-session-email");
  if (!email) return null;
  const isAdmin = await isAdminGroupMember(email);
  return isAdmin ? email : null;
}

// GET /api/admin/albums — list all albums including deleted
export async function GET(request: NextRequest): Promise<NextResponse> {
  const email = await requireAdmin(request);
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const container = await albums();
    const { resources } = await container.items
      .query<AlbumRecord>({
        query: "SELECT * FROM c ORDER BY c.order ASC",
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
  const email = await requireAdmin(request);
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
      userEmail: email,
      ipAddress: ip,
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
  const email = await requireAdmin(request);
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      userEmail: email,
      ipAddress: ip,
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
  const email = await requireAdmin(request);
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const albumsContainer = await albums();
    const { resource: existing } = await albumsContainer.item(id, id).read<AlbumRecord>();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date().toISOString();

    // Soft-delete the album
    await albumsContainer.item(id, id).replace({ ...existing, isDeleted: true, updatedAt: now });

    // Soft-delete all media in the album
    const mediaContainer = await media();
    const { resources: mediaItems } = await mediaContainer.items
      .query<MediaRecord>({
        query: "SELECT * FROM c WHERE c.albumId = @albumId AND c.isDeleted = false",
        parameters: [{ name: "@albumId", value: id }],
      })
      .fetchAll();

    await Promise.all(
      mediaItems.map((item) =>
        mediaContainer.item(item.id, item.albumId).replace({
          ...item,
          isDeleted: true,
          deletedAt: now,
          deletedBy: email,
        })
      )
    );

    await writeAuditLog({
      userEmail: email,
      ipAddress: ip,
      action: AuditAction.ALBUM_DELETED,
      detail: { albumId: id, mediaCount: mediaItems.length },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/albums] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete album" }, { status: 500 });
  }
}
