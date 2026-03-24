import { albums, media, tenants, users } from "@/lib/azure/cosmos";
import {
  AlbumRecord,
  MediaRecord,
  OwnedMediaSummary,
  TenantRecord,
  UserProfileSummary,
  UserRecord,
} from "@/types";

export async function getUserRecordByEmail(
  email: string
): Promise<UserRecord | null> {
  const container = await users();
  const { resources } = await container.items
    .query<UserRecord>({
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: email.toLowerCase() }],
    })
    .fetchAll();

  return resources[0] ?? null;
}

export function toUserProfileSummary(
  email: string,
  user: UserRecord | null
): UserProfileSummary {
  return {
    email,
    displayName: user?.displayName,
    jobTitle: user?.jobTitle,
    organization: user?.organization,
    phoneNumber: user?.phoneNumber,
    officeLocation: user?.officeLocation,
    lastLoginAt: user?.lastLoginAt,
    loginCount: user?.loginCount ?? 0,
    hasPassword: Boolean(user?.passwordHash),
    isPlatformAdmin: Boolean(user?.isPlatformAdmin),
  };
}

export async function getOwnedMediaByEmail(
  email: string,
  limit = 25
): Promise<OwnedMediaSummary[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const mediaContainer = await media();
  const { resources: ownedMedia } = await mediaContainer.items
    .query<
      Pick<
        MediaRecord,
        "id" | "albumId" | "tenantId" | "fileName" | "fileType" | "uploadedAt" | "sizeBytes"
      >
    >({
      query: `SELECT TOP ${safeLimit} c.id, c.albumId, c.tenantId, c.fileName, c.fileType, c.uploadedAt, c.sizeBytes
              FROM c
              WHERE c.uploadedBy = @email AND c.isDeleted = false
              ORDER BY c.uploadedAt DESC`,
      parameters: [{ name: "@email", value: email.toLowerCase() }],
    })
    .fetchAll();

  if (ownedMedia.length === 0) {
    return [];
  }

  const albumIds = [...new Set(ownedMedia.map((item) => item.albumId))];
  const tenantIds = [...new Set(ownedMedia.map((item) => item.tenantId))];

  const [albumMap, tenantMap] = await Promise.all([
    getAlbumMap(albumIds),
    getTenantMap(tenantIds),
  ]);

  return ownedMedia.map((item) => {
    const album = albumMap.get(item.albumId);
    const tenant = tenantMap.get(item.tenantId);

    return {
      id: item.id,
      albumId: item.albumId,
      tenantId: item.tenantId,
      tenantName: tenant?.name ?? "Unknown tenant",
      tenantSlug: tenant?.slug ?? "",
      albumName: album?.name ?? "Unknown album",
      fileName: item.fileName,
      fileType: item.fileType,
      uploadedAt: item.uploadedAt,
      sizeBytes: item.sizeBytes,
    };
  });
}

async function getAlbumMap(albumIds: string[]): Promise<Map<string, AlbumRecord>> {
  if (albumIds.length === 0) {
    return new Map();
  }

  const container = await albums();
  const parameters = albumIds.map((id, index) => ({
    name: `@a${index}`,
    value: id,
  }));
  const { resources } = await container.items
    .query<AlbumRecord>({
      query: `SELECT * FROM c WHERE c.id IN (${parameters
        .map((parameter) => parameter.name)
        .join(", ")})`,
      parameters,
    })
    .fetchAll();

  return new Map(resources.map((album) => [album.id, album]));
}

async function getTenantMap(
  tenantIds: string[]
): Promise<Map<string, TenantRecord>> {
  if (tenantIds.length === 0) {
    return new Map();
  }

  const container = await tenants();
  const parameters = tenantIds.map((id, index) => ({
    name: `@t${index}`,
    value: id,
  }));
  const { resources } = await container.items
    .query<TenantRecord>({
      query: `SELECT * FROM c WHERE c.id IN (${parameters
        .map((parameter) => parameter.name)
        .join(", ")})`,
      parameters,
    })
    .fetchAll();

  return new Map(resources.map((tenant) => [tenant.id, tenant]));
}
