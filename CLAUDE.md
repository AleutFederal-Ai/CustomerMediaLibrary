# CLAUDE.md — Media Gallery | Aleut Federal | Azure GCCH

> This file is the authoritative instruction set for Claude Code working on this project.
> Read this file in full before writing any code, modifying any file, or making any architectural decisions.

---

## Project Identity

- **Client:** Aleut Federal
- **Project:** Secure Media Gallery Web Application
- **Compliance target:** CMMC Level 2 / CUI handling
- **Hosting environment:** Azure Government Community Cloud High (GCCH) — NOT commercial Azure
- **Build spec:** `docs/build-spec.md`
- **Infrastructure guide:** `docs/infrastructure-guide.md`

---

## Non-Negotiable Rules

These apply to every file, every function, every PR. No exceptions.

### 1. No Secrets in Code — Ever

- Never hardcode credentials, connection strings, API keys, tokens, or signing secrets
- Never read secrets from `process.env` directly — load them from Azure Key Vault at runtime using `DefaultAzureCredential`
- The only environment variables permitted in `.env` or App Service config are non-sensitive pointers: `AZURE_KEY_VAULT_URI`, `AZURE_CLOUD`, `GRAPH_ENDPOINT`, `NODE_ENV`, `APP_BASE_URL`
- Never commit a `.env` file. The `.gitignore` must exclude it.

### 2. GCCH Endpoints Only — Never Commercial Azure

Every Azure SDK client must target the government cloud. Use these and only these:

| Service | Endpoint |
|---|---|
| Azure Blob Storage | `https://<account>.blob.core.usgovcloudapi.net` |
| Azure Key Vault | `https://<vault>.vault.usgovcloudapi.net` |
| Microsoft Graph | `https://graph.microsoft.us` |
| Entra ID Token | `https://login.microsoftonline.us/<tenant-id>` |
| Azure Resource Manager | `https://management.usgovcloudapi.net` |

When instantiating any `@azure/*` SDK client, always pass the appropriate `audience` or `authorityHost` for Azure Government. Example:

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();
// KV_URI comes from process.env — the vault address itself is not a secret
const client = new SecretClient(process.env.AZURE_KEY_VAULT_URI!, credential);
```

For Microsoft Graph, always configure the national cloud:

```typescript
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from
  "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ["https://graph.microsoft.us/.default"],
});

const graphClient = Client.initWithMiddleware({
  authProvider,
  baseUrl: "https://graph.microsoft.us/v1.0",
});
```

### 3. All Sensitive Operations Are Server-Side Only

- SAS URL generation: **server-side API routes only** — never expose storage account keys or SAS tokens to the browser
- Magic link token generation and validation: **server-side only**
- Zip file creation: **streamed server-side** — never expose blob URLs to the client
- Session data: stored in **Cosmos DB**, referenced by a cookie value only — no JWT or session data in the cookie itself

### 4. All Routes Except `/login` and `/api/auth/*` Must Be Protected

`middleware.ts` must intercept every request and validate the session cookie before allowing access. Any invalid or missing session redirects to `/login`. Do not rely on individual page components to enforce this.

### 5. Audit Every Sensitive Action

Every event listed in Section 9 of the build spec must call `lib/audit/logger.ts` before returning a response. The audit write must include: `timestamp`, `userEmail`, `ipAddress`, `action`, `detail`. Audit writes are append-only — never expose a delete or update path for audit records.

---

## Tech Stack

| Layer | Package / Service |
|---|---|
| Framework | Next.js 14+ App Router |
| Styling | Tailwind CSS |
| Language | TypeScript (strict mode) |
| Azure Identity | `@azure/identity` |
| Key Vault | `@azure/keyvault-secrets`, `@azure/keyvault-certificates` |
| Blob Storage | `@azure/storage-blob` |
| Cosmos DB | `@azure/cosmos` |
| Graph API | `@microsoft/microsoft-graph-client` |
| Zip generation | `archiver` (server-side streaming) |
| Thumbnail gen | `sharp` (server-side, at upload time) |
| Session cookies | `iron-session` or custom HMAC-signed cookie |

---

## Folder Structure

Maintain this structure exactly. Do not reorganize without updating this file.

```
/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # Login splash — email + password tabs
│   ├── (gallery)/
│   │   ├── page.tsx              # Album grid home (+ Create Album for admins)
│   │   └── album/[id]/
│   │       └── page.tsx          # Album media view + lightbox + bulk download
│   ├── admin/
│   │   ├── page.tsx              # Admin dashboard — KPIs, activity, tenant summaries
│   │   ├── upload/page.tsx
│   │   ├── albums/page.tsx       # Album CRUD (edit, reorder, cover image)
│   │   ├── users/page.tsx        # User mgmt (block, set password, promote)
│   │   ├── members/page.tsx      # Tenant member mgmt (add, remove, change role)
│   │   ├── domains/page.tsx      # Domain allowlist mgmt
│   │   ├── tenants/page.tsx      # Organization CRUD (super-admin only)
│   │   └── audit-logs/page.tsx   # Audit log viewer + CSV export
│   └── select-tenant/
│       └── page.tsx              # Tenant switcher for multi-tenant users
├── app/api/
│   ├── auth/
│   │   ├── request-link/route.ts # POST — validate email, send magic link
│   │   ├── verify/route.ts       # GET — validate token, issue session cookie
│   │   ├── password/route.ts     # POST — password login for platform admins
│   │   └── signout/route.ts      # GET — clear session, redirect to /login
│   ├── media/
│   │   ├── [id]/route.ts         # GET — return signed SAS URL
│   │   └── download/route.ts     # GET — single file download via server
│   ├── albums/route.ts           # GET — list albums for active tenant
│   ├── search/route.ts           # GET — server-side search/filter
│   ├── me/route.ts               # GET — current user permissions
│   ├── download/bulk/route.ts    # POST — zip and stream multiple files
│   ├── tenants/
│   │   ├── route.ts              # GET — user's tenants
│   │   ├── current/route.ts      # GET/PATCH — active tenant
│   │   ├── public/route.ts       # GET — public tenants for login page
│   │   └── lookup/route.ts       # GET — tenant lookup by slug
│   ├── sessions/
│   │   └── current/route.ts      # PATCH — switch active tenant
│   └── admin/
│       ├── upload/route.ts       # POST — chunked upload handler
│       ├── albums/route.ts       # GET/POST/PATCH/DELETE album management
│       ├── users/route.ts        # GET/POST/PATCH user management
│       ├── users/set-password/route.ts  # POST — set user password
│       ├── members/route.ts      # GET/POST/PATCH/DELETE member management
│       ├── domains/route.ts      # GET/POST/DELETE domain allowlist
│       ├── tenants/route.ts      # GET/POST/PATCH/DELETE tenant CRUD
│       ├── stats/route.ts        # GET — dashboard aggregate metrics
│       └── audit/route.ts        # GET audit logs + CSV export
├── components/
│   ├── gallery/
│   │   ├── AlbumGrid.tsx
│   │   ├── AlbumCard.tsx
│   │   ├── CreateAlbumCard.tsx   # Inline album creation from gallery
│   │   ├── MediaGrid.tsx
│   │   └── MediaThumbnail.tsx
│   ├── lightbox/
│   │   └── Lightbox.tsx
│   ├── video-player/
│   │   └── VideoPlayer.tsx       # Native HTML5 <video> only — no 3rd party
│   ├── ui/
│   │   └── CuiBanner.tsx         # CUI notice shown post-login
│   └── admin/
│       ├── UploadForm.tsx
│       ├── AlbumManager.tsx      # Edit, reorder, cover image, create, delete
│       ├── UserManager.tsx       # Search, block, set password, promote/demote
│       ├── MemberManager.tsx     # Add, remove, inline role change
│       ├── DomainManager.tsx     # Add, deactivate email domains
│       └── AuditLogViewer.tsx    # Filter by date/action/email/IP + CSV export
├── lib/
│   ├── auth/
│   │   ├── magic-link.ts         # Token generate / hash / validate
│   │   ├── session.ts            # Session create / validate / expire
│   │   ├── admin.ts              # canAccessAdmin — Cosmos flag + Entra ID fallback
│   │   ├── permissions.ts        # isSuperAdmin, isTenantAdmin, isMediaContributor
│   │   ├── base-url.ts           # getPublicBaseUrl — derive public URL for redirects
│   │   ├── tenant.ts             # getUserTenantIds, getTenantById
│   │   ├── password.ts           # PBKDF2-SHA256 hash + verify
│   │   └── domain-check.ts       # Cosmos DB domain allowlist lookup
│   ├── azure/
│   │   ├── keyvault.ts           # Secret client, secret loader
│   │   ├── blob.ts               # BlobServiceClient, SAS generation
│   │   ├── cosmos.ts             # CosmosClient, container helpers
│   │   └── graph.ts              # Graph client for sending email
│   └── audit/
│       └── logger.ts             # Append-only audit log writer
├── proxy.ts                      # Session gate for all protected routes (Next.js 16)
├── types/
│   └── index.ts                  # Shared TypeScript interfaces + AuditAction enum
├── scripts/
│   ├── seed-dev.ts               # Seed dev data (admin user, tenant, etc.)
│   └── setup-prod.ts             # Production setup wizard
├── infrastructure/
│   └── bicep/                    # All Azure IaC (see infrastructure guide)
├── docs/
│   ├── build-spec.md
│   └── infrastructure-guide.md
├── SECURITY.md
├── README.md
└── CLAUDE.md                     # This file
```

---

## Authentication Flow

### Magic Link (Standard Users)

1. `POST /api/auth/request-link` receives `{ email }` 
2. Validate email format (strict regex — reject anything malformed)
3. Extract domain, look up in Cosmos DB `domains` container
4. **Always return the same response regardless of whether the domain is valid** — do not leak enumeration information: `"If your email is authorized, you will receive a login link shortly."`
5. If domain is valid and user is not on the blocklist: generate a cryptographically random token (32 bytes, `crypto.randomBytes`), hash it with SHA-256, store the hash + expiry (10 min) + email in Cosmos DB `sessions` container
6. Send the raw token (not the hash) in the magic link URL via Microsoft Graph API
7. Rate limit: max 5 requests per email per 15 minutes — track in Cosmos DB, return HTTP 429 if exceeded (but still return the same user-facing message)

### Token Verification

1. `GET /api/auth/verify?token=<raw_token>` 
2. Hash the incoming token, look up the hash in Cosmos DB
3. Validate: not expired, not already used, email not blocklisted
4. Mark token as used (set `usedAt` timestamp — do not delete)
5. Create a new session record in Cosmos DB with 60-minute idle timeout and 8-hour absolute max
6. Set `Set-Cookie` with `httpOnly`, `secure`, `sameSite=strict` flags; cookie value is the session ID only
7. Redirect to `/`

### Session Validation (middleware.ts)

- On every request to a protected route: read session cookie, look up session in Cosmos DB
- Validate: session exists, not expired (check both idle and absolute), email not blocklisted
- On valid session: extend idle timeout, attach `{ email, sessionId }` to request headers for downstream use
- On invalid session: clear the cookie, redirect to `/login`

### Admin Authentication

Admin access is resolved by `lib/auth/admin.ts` → `canAccessAdmin(email)`:

1. **Cosmos DB `isPlatformAdmin` flag** — checked first. Allows seeded admins (e.g. `admin@admin.com`) to work without Entra ID.
2. **Entra ID group membership** — fallback. Calls Microsoft Graph `GET /v1.0/groups/{adminGroupId}/members`.

All admin pages and API routes must use `canAccessAdmin` or `isSuperAdmin` from `lib/auth/permissions.ts`. **Never** call `isAdminGroupMember` directly outside of `lib/auth/admin.ts`.

**Permission tiers:**
- `isSuperAdmin(email)` — platform-wide admin (Cosmos flag OR Entra group)
- `isTenantAdmin(email, tenantId)` — super-admin OR membership role="admin" in that tenant
- `isMediaContributor(email, tenantId)` — tenant admin OR role="contributor"

### Multi-Tenant Architecture

- Every album, media item, membership, and domain belongs to a `tenantId`
- Sessions track `activeTenantId` and `tenantIds[]`
- Middleware attaches `x-active-tenant-id` and `x-tenant-ids` headers to every request
- Users switch tenants via `/select-tenant` → `PATCH /api/sessions/current`
- `APP_BASE_URL` env var (plain, NOT `NEXT_PUBLIC_`) provides the canonical public URL at runtime. `NEXT_PUBLIC_*` vars are baked at Docker build time and cannot be overridden via App Service settings.

---

## Media Handling Rules

### Serving Media

- Never serve binary content directly from the Next.js app — always redirect to a signed SAS URL
- SAS URLs must have a maximum expiry of **15 minutes**
- Generate SAS URLs server-side using the storage account's managed identity (`StorageBlobDataContributor` role)
- The API returns `{ sasUrl: string, expiresAt: string }` — the client uses this URL directly for `<img src>`, `<video src>`, or download links
- Log every media view in the audit log

### Thumbnails

- Generated server-side at upload time using `sharp`
- Stored in the `thumbnails` blob container alongside the original in `media`
- Thumbnail blob name: `{albumId}/{mediaId}_thumb.webp`
- Original blob name: `{albumId}/{mediaId}.{ext}`
- Gallery views always use thumbnail SAS URLs — never full resolution

### Downloads

- **Single file:** Server fetches from blob using managed identity, pipes the stream to the client response. Never redirect to the blob URL.
- **Bulk / zip:** Server fetches all requested blobs, pipes each into `archiver`, streams the zip to the client. Log all included file IDs in the audit log.

---

## Cosmos DB Schema

### `sessions` container — partition key: `/id`
```typescript
{
  id: string;              // session ID (random UUID) or magic link token hash
  type: "session" | "magic-link";
  email: string;
  createdAt: string;       // ISO 8601
  expiresAt: string;       // ISO 8601
  lastActiveAt?: string;   // for sessions — updated on each request
  absoluteExpiresAt?: string; // 8-hour hard limit for sessions
  usedAt?: string;         // for magic links — set on first use
  ipAddress: string;
  activeTenantId?: string; // current tenant context
  tenantIds?: string[];    // all tenants user has access to
  ttl: number;             // Cosmos TTL in seconds — set to auto-expire records
}
```

### `users` container — partition key: `/id`
```typescript
{
  id: string;
  email: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  isBlocked: boolean;
  blockedAt?: string;
  blockedBy?: string;      // admin email
  passwordHash?: string;   // PBKDF2-SHA256 — only when admin assigns a password
  isPlatformAdmin?: boolean; // super-admin flag (bypasses Entra ID check)
}
```

### `tenants` container — partition key: `/id`
```typescript
{
  id: string;
  name: string;
  slug: string;            // URL-safe identifier, unique
  isActive: boolean;
  isPublic: boolean;       // appears in login page tenant selection
  description?: string;
  logoUrl?: string;
  brandColor?: string;     // hex color, e.g. "#1e3a5f"
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

### `memberships` container — partition key: `/tenantId`
```typescript
{
  id: string;
  tenantId: string;        // partition key
  userEmail: string;
  role: "viewer" | "contributor" | "admin";
  source: "domain" | "explicit";
  addedAt: string;
  addedBy: string;
  isActive: boolean;
}
```

### `albums` container — partition key: `/id`
```typescript
{
  id: string;
  tenantId: string;        // which tenant owns this album
  name: string;
  description?: string;
  coverMediaId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}
```

### `media` container — partition key: `/id`
```typescript
{
  id: string;
  albumId: string;
  tenantId: string;        // which tenant owns this media
  fileName: string;
  fileType: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  blobName: string;        // {tenantId}/{albumId}/{mediaId}.{ext}
  thumbnailBlobName: string; // {tenantId}/{albumId}/{mediaId}_thumb.webp
  tags: string[];
  uploadedAt: string;
  uploadedBy: string;      // admin email
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
}
```

### `auditlogs` container — partition key: `/id`
```typescript
{
  id: string;              // UUID
  timestamp: string;       // ISO 8601
  userEmail: string;
  ipAddress: string;
  action: AuditAction;     // enum — see types/index.ts
  tenantId?: string;       // null for cross-tenant / platform actions
  detail: Record<string, unknown>;  // action-specific payload
  ttl: number;             // set for 90-day minimum retention
}
```

### `domains` container — partition key: `/id`
```typescript
{
  id: string;
  domain: string;          // e.g. "aleutfederal.com"
  tenantId: string;        // which tenant this domain grants access to
  addedAt: string;
  addedBy: string;
  isActive: boolean;
}
```

---

## Security Headers

Set these on every response in `middleware.ts` or `next.config.js`:

```typescript
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",                        // no inline scripts
      "style-src 'self' 'unsafe-inline'",         // Tailwind requires this
      "img-src 'self' blob: data: https://*.blob.core.usgovcloudapi.net",
      "media-src 'self' blob: https://*.blob.core.usgovcloudapi.net",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];
```

---

## Rate Limiting

Implement server-side rate limiting on `/api/auth/request-link`:

- Store attempt counts in Cosmos DB (or in-memory with a TTL map if single-instance)
- Key: SHA-256 hash of the email address
- Limit: 5 requests per 15-minute window per email
- On limit exceeded: return HTTP 429, log the attempt in audit log, but still return the generic user-facing message
- Also rate limit by IP: 20 requests per 15 minutes per IP across all auth endpoints

---

## CUI Banner

After login, display a persistent banner at the top of every gallery page:

```
⚠ CONTROLLED UNCLASSIFIED INFORMATION (CUI)
This system may contain Controlled Unclassified Information.
Handle in accordance with applicable laws, regulations, and organizational policies.
Unauthorized disclosure is prohibited.
```

This banner must not be dismissible. Style it in amber/yellow to be clearly visible.

---

## What NOT to Build (Out of Scope for v1)

- No SSO / SAML / OIDC login flows
- No mobile native app
- No video transcoding or adaptive bitrate (serve originals only)
- No classification markings above CUI
- No public-facing APIs
- No client-side secret handling of any kind

---

## Deployed Infrastructure Reference

> Source: `handoff-doc.md` — actual Azure resource names and configuration.
> Resource names use "mymedia" prefix (not "mediagallery" from the build spec).

### Azure Environment

| Item | Value |
|---|---|
| Cloud | Azure Government (`AzureUSGovernment`) |
| Portal | `https://portal.azure.us` |
| Subscription ID | `b2fba6de-c97e-42f2-b4f4-86cfa84a6de0` |
| Tenant ID | `8b37dad1-f014-4751-907b-9c53d310a45f` |
| Resource Group | `rg-mymedia-prod` |
| Region | US Gov Virginia |

### App Service

| Item | Value |
|---|---|
| Name | `mymedia-app` |
| Plan | `mymedia-plan` (P2V3 Linux) |
| Runtime | Node 20 LTS |
| Default Hostname | `mymedia-app.azurewebsites.us` |
| Custom Domain | `mymedia.aleutfederal.us` |
| Managed Identity ID | `8a768bb9-4f65-48c8-8366-e9309a875ab3` |

**App Service environment variables:**

| Name | Value |
|---|---|
| `AZURE_KEY_VAULT_URI` | `https://mymedia-kv.vault.usgovcloudapi.net/` |
| `AZURE_CLOUD` | `AzureUSGovernment` |
| `GRAPH_ENDPOINT` | `https://graph.microsoft.us` |
| `GRAPH_TOKEN_ENDPOINT` | `https://login.microsoftonline.us` |
| `APP_BASE_URL` | `https://mymedia.aleutfederal.us` |
| `NODE_ENV` | `production` |
| `WEBSITES_PORT` | `3000` |

### Key Vault — `mymedia-kv`

| Secret Name | Purpose |
|---|---|
| `GraphTenantId` | GCCH Entra ID tenant ID |
| `GraphClientId` | MediaGallery-MailSender app registration |
| `MailSenderAddress` | `noreply@aleutfederal.us` |
| `SessionSigningSecret` | 64-byte base64 for session cookie signing |
| `MagicLinkSigningSecret` | 64-byte base64 for magic link tokens |
| `CosmosDbEndpoint` | Cosmos DB account URI |
| `StorageAccountName` | `mymediastor` |
| `AdminGroupObjectId` | MediaGallery-Admins Entra group object ID |

### Blob Storage — `mymediastor`

| Item | Value |
|---|---|
| URL | `https://mymediastor.blob.core.usgovcloudapi.net` |
| Auth | Managed identity only (key access disabled) |
| Containers | `media` (originals), `thumbnails` (webp thumbs) |

### Cosmos DB — `mymedia-cosmos`

| Item | Value |
|---|---|
| Endpoint | `https://mymedia-cosmos.documents.azure.us:443/` |
| Database | `mymedia` |
| Capacity | Serverless |
| Auth | Managed identity (Data Contributor role) |
| Containers | `sessions`, `users`, `albums`, `media`, `auditlogs`, `domains`, `tenants`, `memberships` |

### Graph API — Email

| Item | Value |
|---|---|
| App Registration | `MediaGallery-MailSender` |
| Permission | `Mail.Send` (application, admin-consented) |
| Sender | `noreply@aleutfederal.us` |
| Certificate | `MailSenderCert` in Key Vault |
| Restriction | Access policy scoped to sender mailbox only |

### Networking

| Item | Value |
|---|---|
| VNet | `mymedia-vnet` (`10.0.0.0/16`) |
| App Gateway | `mymedia-appgw` (WAF V2, Prevention mode, OWASP 3.2) |
| Public IP | `52.245.225.20` |
| TLS | Self-signed placeholder — **must be replaced before go-live** |
| App Service access | Restricted to App Gateway subnet only |

### Monitoring

| Item | Value |
|---|---|
| Log Analytics | `mymedia-logs` (90-day retention) |
| Diagnostics on | Key Vault, Blob Storage, Cosmos DB, App Service, App Gateway |

---

## Open Items (Do Not Implement Until Confirmed)

- [x] `AZURE_TENANT_ID` — **resolved** in Key Vault as `GraphTenantId`
- [x] `GRAPH_CLIENT_ID` — **resolved** in Key Vault as `GraphClientId`
- [x] `ADMIN_GROUP_OBJECT_ID` — **resolved** in Key Vault as `AdminGroupObjectId`
- [x] `MAIL_SENDER_ADDRESS` — **resolved**: `noreply@aleutfederal.us`
- [x] Custom domain — **resolved**: `mymedia.aleutfederal.us` (set as `APP_BASE_URL`)
- [ ] Replace self-signed TLS cert on App Gateway (requires IT/DNS admin)
- [ ] Customer logo and brand colors (per-tenant branding supported via tenant settings)
- [ ] Soft-delete recovery window duration (default assumption: 30 days)
- [ ] Max video upload size per file
- [ ] Rotate signing secrets on schedule (recommend 90-day rotation via Key Vault expiration)

---

## Definition of Done

A feature is complete when:
- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] All API routes validate input and return appropriate HTTP status codes
- [ ] All sensitive actions write to the audit log
- [ ] No secrets in source code (grep for connection strings before commit)
- [ ] Security headers are present on all responses
- [ ] GCCH endpoints are used — no `*.azure.com` URLs (only `*.usgovcloudapi.net`, `graph.microsoft.us`, `login.microsoftonline.us`)
