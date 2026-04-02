import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { albums, media } from "@/lib/azure/cosmos";
import { writeAuditLog } from "@/lib/audit/logger";
import { isMediaContributor, isSuperAdmin } from "@/lib/auth/permissions";
import { withRouteLogging, logWarn, logInfo } from "@/lib/logging/structured";
import { AlbumRecord, MediaRecord, AuditAction } from "@/types";

const ALLOWED_URL_PATTERNS = [
  /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https:\/\/youtu\.be\/[\w-]+/,
  /^https:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
  /^https:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  /^https:\/\/(www\.)?vimeo\.com\/\d+/,
  /^https:\/\/player\.vimeo\.com\/video\/\d+/,
  /^https:\/\/(www\.)?dailymotion\.com\/video\/[\w-]+/,
  /^https:\/\/(www\.)?rumble\.com\/[\w-]+/,
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_URL_PATTERNS.some((pattern) => pattern.test(url));
  } catch {
    return false;
  }
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]+)/,
    /youtu\.be\/([\w-]+)/,
    /youtube\.com\/embed\/([\w-]+)/,
    /youtube\.com\/shorts\/([\w-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match?.[1] ?? null;
}

function getThumbnailPlaceholder(url: string): string {
  const ytId = extractYouTubeId(url);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

  // For other platforms, return empty — the UI will show a placeholder
  return "";
}

function getPlatformName(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "YouTube";
  if (/vimeo\.com/.test(url)) return "Vimeo";
  if (/dailymotion\.com/.test(url)) return "Dailymotion";
  if (/rumble\.com/.test(url)) return "Rumble";
  return "External Video";
}

/**
 * POST /api/admin/media-urls
 * Add an external media URL (YouTube, Vimeo, etc.) to an album.
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const email = request.headers.get("x-session-email");
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = request.headers.get("x-active-tenant-id") ?? "";
  if (!tenantId) {
    logWarn("admin.media-urls.POST.no_tenant", { email });
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const ip = request.headers.get("x-client-ip") ?? "unknown";

  // Check contributor OR super-admin access.
  // isMediaContributor already checks isTenantAdmin which checks isSuperAdmin,
  // so a single call covers all permission tiers.
  const canContribute = await isMediaContributor(email, tenantId);
  if (!canContribute) {
    // Explicit super-admin fallback for cases where the membership query fails
    // but the user has the isPlatformAdmin flag in Cosmos.
    const superAdmin = await isSuperAdmin(email);
    if (!superAdmin) {
      logWarn("admin.media-urls.POST.forbidden", {
        email,
        tenantId,
        canContribute: false,
        isSuperAdmin: false,
        hint: "User is not a contributor, tenant admin, or super admin for this tenant",
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { albumId?: string; url?: string; title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const albumId = (body.albumId ?? "").trim();
  const url = (body.url ?? "").trim();
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim();

  if (!albumId) {
    return NextResponse.json({ error: "albumId is required" }, { status: 400 });
  }
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!isAllowedUrl(url)) {
    return NextResponse.json(
      { error: "Only HTTPS URLs from supported platforms (YouTube, Vimeo, Dailymotion, Rumble) are allowed" },
      { status: 400 }
    );
  }

  // Verify the album exists and belongs to this tenant
  const albumsContainer = await albums();
  const { resource: album } = await albumsContainer
    .item(albumId, albumId)
    .read<AlbumRecord>();

  if (!album || album.isDeleted || album.tenantId !== tenantId) {
    return NextResponse.json({ error: "Album not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const id = uuidv4();
  const platformName = getPlatformName(url);
  const displayTitle = title || `${platformName} Video`;

  const record: MediaRecord = {
    id,
    albumId,
    tenantId,
    fileName: displayTitle,
    title: displayTitle,
    description: description || undefined,
    fileType: "link",
    mimeType: "text/uri-list",
    sizeBytes: 0,
    blobName: "",
    thumbnailBlobName: "",
    tags: [platformName.toLowerCase()],
    uploadedAt: now,
    uploadedBy: email,
    isDeleted: false,
    externalUrl: url,
  };

  const container = await media();
  await container.items.create(record);

  await writeAuditLog({
    userEmail: email,
    ipAddress: ip,
    tenantId,
    action: AuditAction.MEDIA_URL_ADDED,
    detail: { mediaId: id, albumId, url, platform: platformName },
  });

  const thumbnailUrl = getThumbnailPlaceholder(url);

  logInfo("admin.media-urls.POST.created", { email, tenantId, mediaId: id, albumId, platform: platformName });

  return NextResponse.json(
    {
      id: record.id,
      albumId: record.albumId,
      tenantId: record.tenantId,
      fileName: record.fileName,
      title: record.title,
      description: record.description,
      fileType: record.fileType,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      thumbnailUrl,
      tags: record.tags,
      uploadedAt: record.uploadedAt,
      externalUrl: record.externalUrl,
    },
    { status: 201 }
  );
}

export const POST = withRouteLogging("admin.media-urls.POST", handlePost);
