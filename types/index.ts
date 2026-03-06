// ============================================================
// Cosmos DB document types
// ============================================================

export type SessionType = "session" | "magic-link";

export interface SessionRecord {
  id: string;
  type: SessionType;
  email: string;
  createdAt: string;
  expiresAt: string;
  lastActiveAt?: string;
  absoluteExpiresAt?: string;
  usedAt?: string;
  ipAddress: string;
  ttl: number;
}

export interface UserRecord {
  id: string;
  email: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  isBlocked: boolean;
  blockedAt?: string;
  blockedBy?: string;
}

export interface AlbumRecord {
  id: string;
  name: string;
  description?: string;
  coverMediaId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export type FileType = "image" | "video";

export interface MediaRecord {
  id: string;
  albumId: string;
  fileName: string;
  fileType: FileType;
  mimeType: string;
  sizeBytes: number;
  blobName: string;
  thumbnailBlobName: string;
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  userEmail: string;
  ipAddress: string;
  action: AuditAction;
  detail: Record<string, unknown>;
  ttl: number;
}

export interface DomainRecord {
  id: string;
  domain: string;
  addedAt: string;
  addedBy: string;
  isActive: boolean;
}

// ============================================================
// Audit action enum
// ============================================================

export enum AuditAction {
  // Auth
  MAGIC_LINK_REQUESTED = "magic_link_requested",
  MAGIC_LINK_VERIFIED = "magic_link_verified",
  MAGIC_LINK_FAILED = "magic_link_failed",
  MAGIC_LINK_RATE_LIMITED = "magic_link_rate_limited",
  SESSION_CREATED = "session_created",
  SESSION_EXPIRED = "session_expired",
  SESSION_REVOKED = "session_revoked",

  // Media access
  MEDIA_VIEWED = "media_viewed",
  MEDIA_DOWNLOADED = "media_downloaded",
  BULK_DOWNLOAD = "bulk_download",
  ALBUM_VIEWED = "album_viewed",

  // Admin — media
  MEDIA_UPLOADED = "media_uploaded",
  MEDIA_DELETED = "media_deleted",
  ALBUM_CREATED = "album_created",
  ALBUM_UPDATED = "album_updated",
  ALBUM_DELETED = "album_deleted",

  // Admin — users
  USER_BLOCKED = "user_blocked",
  USER_UNBLOCKED = "user_unblocked",

  // Admin — domains
  DOMAIN_ADDED = "domain_added",
  DOMAIN_DEACTIVATED = "domain_deactivated",
}

// ============================================================
// Request context — attached to headers by middleware
// ============================================================

export interface SessionContext {
  sessionId: string;
  email: string;
  isAdmin: boolean;
}

// ============================================================
// API response shapes
// ============================================================

export interface ApiError {
  error: string;
}

export interface SasUrlResponse {
  sasUrl: string;
  expiresAt: string;
}

export interface AlbumListItem {
  id: string;
  name: string;
  description?: string;
  coverThumbnailUrl?: string;
  mediaCount: number;
  order: number;
}

export interface MediaListItem {
  id: string;
  albumId: string;
  fileName: string;
  fileType: FileType;
  mimeType: string;
  sizeBytes: number;
  thumbnailUrl: string;
  tags: string[];
  uploadedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  continuationToken?: string;
  total?: number;
}
