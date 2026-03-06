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
- The only environment variables permitted in `.env` or App Service config are non-sensitive pointers: `AZURE_KEY_VAULT_URI`, `AZURE_CLOUD`, `GRAPH_ENDPOINT`, `NODE_ENV`
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
│   │       └── page.tsx          # Login splash — email input only
│   ├── (gallery)/
│   │   ├── page.tsx              # Album grid home
│   │   └── album/[id]/
│   │       └── page.tsx          # Album media view
│   └── admin/
│       ├── page.tsx              # Admin dashboard
│       ├── upload/page.tsx
│       ├── albums/page.tsx
│       ├── users/page.tsx
│       └── audit-logs/page.tsx
├── app/api/
│   ├── auth/
│   │   ├── request-link/route.ts # POST — validate email, send magic link
│   │   └── verify/route.ts       # GET — validate token, issue session cookie
│   ├── media/
│   │   ├── [id]/route.ts         # GET — return signed SAS URL
│   │   └── download/route.ts     # GET — single file download via server
│   ├── albums/route.ts           # GET — list albums
│   ├── search/route.ts           # GET — server-side search/filter
│   ├── download/bulk/route.ts    # POST — zip and stream multiple files
│   └── admin/
│       ├── upload/route.ts       # POST — chunked upload handler
│       ├── albums/route.ts       # CRUD album management
│       ├── users/route.ts        # GET/POST user management
│       ├── domains/route.ts      # GET/POST domain allowlist
│       └── audit/route.ts        # GET audit logs + CSV export
├── components/
│   ├── gallery/
│   │   ├── AlbumGrid.tsx
│   │   ├── AlbumCard.tsx
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
│       ├── AlbumManager.tsx
│       ├── UserManager.tsx
│       └── AuditLogViewer.tsx
├── lib/
│   ├── auth/
│   │   ├── magic-link.ts         # Token generate / hash / validate
│   │   ├── session.ts            # Session create / validate / expire
│   │   └── domain-check.ts       # Cosmos DB domain allowlist lookup
│   ├── azure/
│   │   ├── keyvault.ts           # Secret client, secret loader
│   │   ├── blob.ts               # BlobServiceClient, SAS generation
│   │   ├── cosmos.ts             # CosmosClient, container helpers
│   │   └── graph.ts              # Graph client for sending email
│   └── audit/
│       └── logger.ts             # Append-only audit log writer
├── middleware.ts                  # Session gate for all protected routes
├── types/
│   └── index.ts                  # Shared TypeScript interfaces
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

- Admin routes (`/admin/*`, `/api/admin/*`) require the session user's email to belong to the Entra ID group `MediaGallery-Admins`
- Check group membership by calling Microsoft Graph: `GET /v1.0/groups/{adminGroupId}/members` and verify the email is present
- Cache this check for the duration of the session — do not call Graph on every admin request
- The admin group object ID is loaded from Key Vault (`AdminGroupObjectId`)

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
  ttl: number;             // Cosmos TTL in seconds — set to auto-expire records
}
```

### `users` container — partition key: `/email`
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
}
```

### `albums` container — partition key: `/id`
```typescript
{
  id: string;
  name: string;
  coverMediaId?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}
```

### `media` container — partition key: `/albumId`
```typescript
{
  id: string;
  albumId: string;
  fileName: string;
  fileType: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  blobName: string;        // path in blob storage
  thumbnailBlobName: string;
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
  detail: Record<string, unknown>;  // action-specific payload
  ttl: number;             // set for 90-day minimum retention
}
```

### `domains` container — partition key: `/domain`
```typescript
{
  id: string;
  domain: string;          // e.g. "aleutfederal.com"
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

## Open Items (Do Not Implement Until Confirmed)

These are blockers that require client input. Build placeholder stubs only:

- [ ] `AZURE_TENANT_ID` — needed for Graph and Entra ID auth
- [ ] `GRAPH_CLIENT_ID` — MediaGallery-MailSender app registration
- [ ] `ADMIN_GROUP_OBJECT_ID` — MediaGallery-Admins Entra group ID
- [ ] `MAIL_SENDER_ADDRESS` — licensed GCC High Exchange mailbox
- [ ] Customer logo and brand colors
- [ ] Custom domain name
- [ ] Soft-delete recovery window duration (default assumption: 30 days)
- [ ] Max video upload size per file

---

## Build Order

Follow this sequence. Do not skip ahead — each phase depends on the previous.

1. **`lib/azure/keyvault.ts`** — secret loader that everything else depends on
2. **`lib/azure/cosmos.ts`** — DB client and container helpers
3. **`lib/azure/blob.ts`** — storage client and SAS generation
4. **`lib/azure/graph.ts`** — Graph email client
5. **`lib/audit/logger.ts`** — audit writer (depends on Cosmos)
6. **`middleware.ts`** — route protection (depends on Cosmos session lookup)
7. **`lib/auth/`** — magic link + session logic
8. **`/api/auth/request-link`** and **`/api/auth/verify`** routes
9. **`app/(auth)/login/page.tsx`** — login splash UI
10. **`app/(gallery)/page.tsx`** and **`album/[id]/page.tsx`** — gallery UI
11. **Components:** `AlbumGrid`, `MediaGrid`, `Lightbox`, `VideoPlayer`, `CuiBanner`
12. **`/api/media/`** routes — SAS URL generation, single download
13. **`/api/download/bulk`** — zip streaming
14. **`app/admin/`** pages and **`/api/admin/`** routes
15. **`infrastructure/bicep/`** — Bicep IaC for all resources
16. **`README.md`** — deployment instructions
17. **`SECURITY.md`** — threat model and compliance mapping

---

## Definition of Done

A feature is complete when:
- [ ] TypeScript compiles with zero errors (`tsc --noEmit`)
- [ ] All API routes validate input and return appropriate HTTP status codes
- [ ] All sensitive actions write to the audit log
- [ ] No secrets in source code (grep for connection strings before commit)
- [ ] Security headers are present on all responses
- [ ] GCCH endpoints are used — no `*.azure.com` URLs (only `*.usgovcloudapi.net`, `graph.microsoft.us`, `login.microsoftonline.us`)
