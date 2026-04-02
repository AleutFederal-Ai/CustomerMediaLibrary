import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { albums, media } from "@/lib/azure/cosmos";
import { deleteBlob } from "@/lib/azure/blob";
import { writeAuditLog } from "@/lib/audit/logger";
import { isTenantAdmin } from "@/lib/auth/permissions";
import { generateAlbumSlug, ensureUniqueAlbumSlug } from "@/lib/gallery/albums";
import { AlbumRecord, MediaRecord, AuditAction } from "@/types";
import { withRouteLogging, logWarn, logError } from "@/lib/logging/structured";

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
async function handleGet(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.albums.GET.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    logError("admin.albums.GET.error", { tenantId: caller.tenantId, error: err });
    return NextResponse.json({ error: "Failed to load albums" }, { status: 500 });
  }
}

// POST /api/admin/albums — create album
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.albums.POST.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  let body: { name?: string; slug?: string; description?: string; order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Generate slug: use provided slug or auto-generate from name
  const rawSlug = body.slug?.trim()
    ? generateAlbumSlug(body.slug.trim())
    : generateAlbumSlug(name);
  const slug = rawSlug
    ? await ensureUniqueAlbumSlug(rawSlug, caller.tenantId)
    : undefined;

  const now = new Date().toISOString();
  const album: AlbumRecord = {
    id: uuidv4(),
    tenantId: caller.tenantId,
    name,
    slug,
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
    logError("admin.albums.POST.error", { tenantId: caller.tenantId, albumName: name, error: err });
    return NextResponse.json({ error: "Failed to create album" }, { status: 500 });
  }
}

// PATCH /api/admin/albums?id=<id> — update album
async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.albums.PATCH.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: Partial<
    Pick<AlbumRecord, "name" | "slug" | "description" | "order" | "coverMediaId">
  >;
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

    if (body.coverMediaId !== undefined) {
      const normalizedCoverMediaId = body.coverMediaId?.trim();
      if (!normalizedCoverMediaId) {
        return NextResponse.json(
          { error: "coverMediaId must be a valid media id" },
          { status: 400 }
        );
      }

      const mediaContainer = await media();
      const { resource: coverMedia } = await mediaContainer
        .item(normalizedCoverMediaId, normalizedCoverMediaId)
        .read<MediaRecord>();

      if (
        !coverMedia ||
        coverMedia.isDeleted ||
        coverMedia.tenantId !== caller.tenantId ||
        coverMedia.albumId !== id
      ) {
        return NextResponse.json(
          { error: "Cover image must belong to this album" },
          { status: 400 }
        );
      }

      if (coverMedia.fileType !== "image") {
        return NextResponse.json(
          { error: "Only images can be used as album covers" },
          { status: 400 }
        );
      }

      body.coverMediaId = normalizedCoverMediaId;
    }

    // Resolve slug if provided
    let resolvedSlug: string | undefined;
    if (body.slug !== undefined) {
      const rawSlug = generateAlbumSlug(body.slug.trim());
      if (rawSlug) {
        resolvedSlug = await ensureUniqueAlbumSlug(rawSlug, caller.tenantId, id);
      } else {
        resolvedSlug = undefined; // Empty slug removes it
      }
    }

    const updated: AlbumRecord = {
      ...existing,
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.slug !== undefined && { slug: resolvedSlug }),
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
    logError("admin.albums.PATCH.error", { tenantId: caller.tenantId, albumId: id, error: err });
    return NextResponse.json({ error: "Failed to update album" }, { status: 500 });
  }
}

// DELETE /api/admin/albums?id=<id> — soft delete album and its media
async function handleDelete(request: NextRequest): Promise<NextResponse> {
  const caller = await requireTenantAdmin(request);
  if (!caller) {
    const email = request.headers.get("x-session-email");
    logWarn("admin.albums.DELETE.forbidden", { email, reason: "Not a tenant admin or missing tenant" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
        mediaContainer.item(item.id, item.id).replace({
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
    logError("admin.albums.DELETE.error", { tenantId: caller.tenantId, albumId: id, error: err });
    return NextResponse.json({ error: "Failed to delete album" }, { status: 500 });
  }
}

export const GET = withRouteLogging("admin.albums.GET", handleGet);
export const POST = withRouteLogging("admin.albums.POST", handlePost);
export const PATCH = withRouteLogging("admin.albums.PATCH", handlePatch);
export const DELETE = withRouteLogging("admin.albums.DELETE", handleDelete);
