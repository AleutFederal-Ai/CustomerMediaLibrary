// ============================================================
// Multi-tenant types
// ============================================================

export type MemberRole = "viewer" | "contributor" | "admin";
export type MemberSource = "domain" | "explicit";

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;           // URL-safe identifier, e.g. "aleutfederal"
  isActive: boolean;
  isPublic: boolean;      // true = appears in public tenant selection list
  description?: string;   // short blurb shown on the selection card
  logoUrl?: string;       // URL to tenant logo image
  brandColor?: string;    // hex color, e.g. "#1e3a5f"
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/**
 * Grants a user access to a tenant.
 * source="domain"   — automatically created when a matching domain record exists.
 * source="explicit" — manually granted by an admin regardless of email domain.
 */
export interface MembershipRecord {
  id: string;
  tenantId: string;       // partition key
  userEmail: string;
  role: MemberRole;
  source: MemberSource;
  addedAt: string;
  addedBy: string;
  isActive: boolean;
}

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
  // Multi-tenant: resolved at session creation, updated on tenant switch
  activeTenantId?: string;
  tenantIds?: string[];
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
  displayName?: string;
  jobTitle?: string;
  organization?: string;
  phoneNumber?: string;
  officeLocation?: string;
  /** PBKDF2-SHA256 hash — only set when an admin assigns a password */
  passwordHash?: string;
  /** True for platform super-admins who can access /admin without Entra ID group membership */
  isPlatformAdmin?: boolean;
}

export interface UserAdminListItem {
  id: string;
  email: string;
  lastLoginAt: string;
  loginCount: number;
  isBlocked: boolean;
  isPlatformAdmin?: boolean;
}

export interface AlbumRecord {
  id: string;
  tenantId: string;       // which tenant owns this album
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
  tenantId: string;       // which tenant owns this media
  fileName: string;
  fileType: FileType;
  mimeType: string;
  sizeBytes: number;
  blobName: string;        // {tenantId}/{albumId}/{mediaId}.{ext}
  thumbnailBlobName: string; // {tenantId}/{albumId}/{mediaId}_thumb.webp
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
  tenantId?: string;      // null for super-admin / cross-tenant actions
  detail: Record<string, unknown>;
  ttl: number;
}

export interface DomainRecord {
  id: string;
  domain: string;         // partition key
  tenantId: string;       // which tenant this domain grants access to
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
  PASSWORD_LOGIN_SUCCESS = "password_login_success",
  PASSWORD_LOGIN_FAILED = "password_login_failed",
  PASSWORD_SET = "password_set",
  PROFILE_UPDATED = "profile_updated",
  SESSION_CREATED = "session_created",
  SESSION_EXPIRED = "session_expired",
  SESSION_REVOKED = "session_revoked",
  TENANT_SWITCHED = "tenant_switched",

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

  // Admin — tenants
  TENANT_CREATED = "tenant_created",
  TENANT_UPDATED = "tenant_updated",
  TENANT_DEACTIVATED = "tenant_deactivated",

  // Admin — memberships
  MEMBER_ADDED = "member_added",
  MEMBER_REMOVED = "member_removed",
  MEMBER_ROLE_CHANGED = "member_role_changed",

  // Admin — user management
  USER_PROMOTED = "user_promoted",
}

// ============================================================
// Request context — attached to headers by middleware
// ============================================================

export interface SessionContext {
  sessionId: string;
  email: string;
  isAdmin: boolean;
  activeTenantId: string | null;
  tenantIds: string[];
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

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  isActive: boolean;
  description?: string;
  logoUrl?: string;
  brandColor?: string;
  createdAt: string;
}

/** Minimal public info returned to unauthenticated users */
export interface TenantPublicItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  brandColor?: string;
}

export interface AlbumListItem {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  coverThumbnailUrl?: string;
  mediaCount: number;
  order: number;
}

export interface MediaListItem {
  id: string;
  albumId: string;
  tenantId: string;
  fileName: string;
  fileType: FileType;
  mimeType: string;
  sizeBytes: number;
  thumbnailUrl: string;
  tags: string[];
  uploadedAt: string;
}

export interface UserProfileSummary {
  email: string;
  displayName?: string;
  jobTitle?: string;
  organization?: string;
  phoneNumber?: string;
  officeLocation?: string;
  lastLoginAt?: string;
  loginCount: number;
  hasPassword: boolean;
  isPlatformAdmin: boolean;
}

export interface OwnedMediaSummary {
  id: string;
  albumId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  albumName: string;
  fileName: string;
  fileType: FileType;
  uploadedAt: string;
  sizeBytes: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  continuationToken?: string;
  total?: number;
}

// ============================================================
// Operational health + API verification
// ============================================================

export type HealthStatus = "healthy" | "degraded" | "unknown";

export interface ServiceCheckResult {
  ok: boolean | null;
  message: string;
  latencyMs?: number;
}

export interface DependencyHealthReport {
  status: HealthStatus;
  timestamp: string;
  checks: {
    cosmosDb: ServiceCheckResult;
    blobStorage: ServiceCheckResult;
    keyVault: ServiceCheckResult;
    graphApi: ServiceCheckResult;
  };
}

export type ApiAuthScope =
  | "public"
  | "authenticated"
  | "tenant"
  | "tenantAdmin"
  | "contributor"
  | "platformAdmin";

export type ApiVerificationMode = "automated" | "manual";

export interface ApiEndpointDefinition {
  id: string;
  category: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  pathTemplate: string;
  description: string;
  authScope: ApiAuthScope;
  verificationMode: ApiVerificationMode;
  destructive?: boolean;
  sampleBody?: string;
}

export type ApiProbeStatus = "passed" | "failed" | "skipped";

export interface ApiProbeResult {
  endpointId: string;
  method: string;
  path: string;
  status: ApiProbeStatus;
  httpStatus?: number;
  durationMs?: number;
  message: string;
  responsePreview?: string;
}

export interface ApiProbeSummary {
  passed: number;
  failed: number;
  skipped: number;
}

export interface ApiHealthSnapshot {
  generatedAt: string;
  dependencyHealth: DependencyHealthReport;
  probes: {
    summary: ApiProbeSummary;
    results: ApiProbeResult[];
  };
  endpoints: ApiEndpointDefinition[];
  samples: {
    activeTenantId?: string;
    activeTenantSlug?: string;
    sampleAlbumId?: string;
    sampleMediaId?: string;
  };
}

export interface ApiManualProbeResponse {
  method: string;
  path: string;
  ok: boolean;
  status: number;
  durationMs: number;
  contentType: string;
  responseBody: string;
}
