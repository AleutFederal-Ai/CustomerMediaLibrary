# Media Gallery — Aleut Federal
## Secure Media Gallery | Azure GCCH Deployment

> **Environment:** Azure Government Community Cloud High (GCCH)
> **Compliance:** CMMC Level 2 / CUI
> **Stack:** Next.js 14 · TypeScript · Tailwind CSS · Azure Blob · Cosmos DB · Key Vault

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Structure](#2-repository-structure)
3. [First-Time Infrastructure Setup](#3-first-time-infrastructure-setup)
4. [Local Development](#4-local-development)
5. [Deployment](#5-deployment)
6. [Environment Configuration](#6-environment-configuration)
7. [Post-Deployment Verification](#7-post-deployment-verification)
8. [Ongoing Operations](#8-ongoing-operations)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

### Required Access
- Azure Government subscription with Contributor or Owner role
- Access to the Aleut Federal GCCH Entra ID tenant
- Exchange Online GCC High admin access (for mail sender setup)
- Azure CLI installed and up to date

### Required Tools
```bash
node --version    # 20.x LTS or higher
npm --version     # 10.x or higher
az --version      # 2.55.0 or higher
```

### Azure CLI — GCCH Configuration

**Always run this at the start of every CLI session:**
```bash
az cloud set --name AzureUSGovernment
az login
az account set --subscription "<YOUR-GCCH-SUBSCRIPTION-ID>"
```

> ⚠️ **Critical:** Running `az` commands without setting `AzureUSGovernment` first will create resources in commercial Azure. Verify with `az cloud show --query name` before running any resource commands.

---

## 2. Repository Structure

```
/
├── app/                      # Next.js App Router pages and API routes
│   ├── (auth)/login/         # Login splash screen
│   ├── (gallery)/            # Authenticated gallery pages
│   └── admin/                # Admin panel pages
├── app/api/                  # Server-side API routes
│   ├── auth/                 # Magic link request + verification
│   ├── media/                # SAS URL generation, single download
│   ├── download/bulk/        # Server-side zip streaming
│   └── admin/                # Admin management APIs
├── components/               # React components
├── lib/
│   ├── auth/                 # Magic link and session logic
│   ├── azure/                # Azure SDK clients (Blob, Cosmos, Key Vault, Graph)
│   └── audit/                # Audit log writer
├── proxy.ts                  # Route protection + security headers — runs on every request
├── infrastructure/
│   └── bicep/                # Azure Infrastructure as Code
├── docs/
│   ├── build-spec.md         # Full project requirements
│   └── infrastructure-guide.md  # Step-by-step Azure setup
├── CLAUDE.md                 # Claude Code instruction file
├── SECURITY.md               # Threat model and compliance mapping
└── README.md                 # This file
```

---

## 2.1 Tenant/Admin Navigation

- Admin entry links should route users to `/admin?tenant=<slug>` (page navigation), not directly to API handoff endpoints.
- Tenant context switching is enforced server-side during page load; when needed, server components trigger `/api/sessions/current` to switch active tenant and continue safely.
- This keeps navigation user-friendly (normal page transitions) and avoids exposing raw API 401 responses during menu-driven portal navigation.

---

## 3. First-Time Infrastructure Setup

Follow `docs/infrastructure-guide.md` in order. The steps below are a summary — refer to the full guide for complete commands.

### Step 0 — Set Azure CLI to Government Cloud
```bash
az cloud set --name AzureUSGovernment
az login
```

### Step 1 — Set Variables
```bash
LOCATION="usgovvirginia"
RG="rg-mymedia-prod"
PREFIX="mymedia"
```

### Steps 2–15 — Run Infrastructure Setup
Follow `docs/infrastructure-guide.md` steps 2 through 15 in sequence:

| Step | What it creates |
|---|---|
| 2 | Resource Group |
| 3 | Log Analytics Workspace |
| 4 | Azure Key Vault |
| 5 | Azure Blob Storage (media + thumbnails containers) |
| 6 | Azure Cosmos DB + all containers |
| 7 | App Service Plan + Web App + Managed Identity |
| 8 | RBAC role assignments (Key Vault, Storage, Cosmos) |
| 9 | Entra ID app registration for Graph email sending |
| 10 | Virtual Network + subnets |
| 11 | Application Gateway v2 + WAF policy (Prevention mode, OWASP 3.2) |
| 12 | Entra ID security group (myMedia-Admins) |
| 13 | Secrets stored in Key Vault |
| 14 | App Service environment variable configuration |
| 15 | Azure Monitor alerts |

### Required Inputs Before Setup

You must have these values before running infrastructure setup:

| Value | Source |
|---|---|
| GCCH Subscription ID | Azure portal |
| GCCH Tenant ID | Entra ID → Overview |
| Admin user email | e.g. `admin@aleutfederal.com` |
| Mail sender mailbox | e.g. `noreply@aleutfederal.com` (must be licensed Exchange Online GCC High mailbox) |
| Custom domain name | DNS — required before App Gateway TLS setup |

### Seed Initial Domain Allowlist

After Cosmos DB is created, seed the permitted domains. Run this once:
```bash
# Use the Cosmos DB Data Explorer in portal.azure.us, or run via the app's
# first-boot seed script (if implemented):
# npm run seed:domains
```

Initial domains (from build spec):
- `aleutfederal.com`
- `aleutfederal.us`
- `us.af.mil`
- `ussf.mil`

---

## 4. Local Development

> **Important:** Local development requires a real Azure environment. Do not attempt to mock Azure services — the GCCH endpoint configuration must be validated against real services to avoid endpoint drift bugs.

### Option A — Developer Azure Subscription (Recommended)
Provision a separate, non-GCCH Azure subscription for development with the same resource types. Use environment variables to point at that subscription. This keeps dev costs low and avoids any risk of breaking production GCCH resources.

### Option B — Direct GCCH Dev/Test
If a dev/test resource group exists in the GCCH subscription, developers can authenticate against it directly.

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd media-gallery

# Install dependencies
npm install

# Create local env file (never commit this)
cp .env.example .env.local
```

### `.env.local` — Allowed Non-Secret Variables Only

```bash
# These are the ONLY values that go in .env.local
# No secrets, connection strings, or keys ever go here

AZURE_KEY_VAULT_URI=https://<your-dev-vault>.vault.usgovcloudapi.net
AZURE_CLOUD=AzureUSGovernment
GRAPH_ENDPOINT=https://graph.microsoft.us
GRAPH_TOKEN_ENDPOINT=https://login.microsoftonline.us
NODE_ENV=development
```

All secrets (session keys, Cosmos endpoint, Graph credentials) are loaded at runtime from Key Vault using your developer's Azure CLI credentials via `DefaultAzureCredential`.

### Authenticate Locally

```bash
# Log in to the Azure Government cloud
az cloud set --name AzureUSGovernment
az login

# DefaultAzureCredential will pick up your CLI login automatically
```

### Run the Dev Server

```bash
npm run dev
```

App will be available at `http://localhost:3000`.

> **Note:** Magic link emails will attempt to send via Microsoft Graph. In local dev, you may want to log the link to the console instead. Set `NODE_ENV=development` and the Graph email step will fall through to console output if the Graph credentials are not available locally.

---

## 5. Deployment

### CI/CD (GitHub Actions / Azure DevOps)

The pipeline should:
1. Run `npm ci`
2. Run `npm run build` (fails build if TypeScript errors)
3. Run `npm audit --audit-level=high` (fails build on high/critical CVEs)
4. Run `npm run lint`
5. Deploy to Azure App Service via `az webapp deploy` or the Azure Web Apps GitHub Action

> App Service is configured with `WEBSITE_RUN_FROM_PACKAGE=1` — deploy a ZIP package, not individual files.

### Manual Deployment

```bash
# Build the app
npm run build

# Create deployment package
zip -r deploy.zip .next/ public/ package.json package-lock.json next.config.js

# Deploy to App Service
az webapp deploy \
  --name <app-service-name> \
  --resource-group <resource-group> \
  --src-path deploy.zip \
  --type zip
```

### After Deployment

```bash
# Restart the app to pick up any new Key Vault secrets
az webapp restart \
  --name <app-service-name> \
  --resource-group <resource-group>
```

---

## 6. Environment Configuration

All configuration is managed through Azure App Service Application Settings (non-sensitive) and Azure Key Vault (sensitive).

### App Service Application Settings (Non-Sensitive)

Set via `docs/infrastructure-guide.md` Step 14:

| Setting | Value |
|---|---|
| `AZURE_KEY_VAULT_URI` | Key Vault URI from GCCH |
| `AZURE_CLOUD` | `AzureUSGovernment` |
| `GRAPH_ENDPOINT` | `https://graph.microsoft.us` |
| `GRAPH_TOKEN_ENDPOINT` | `https://login.microsoftonline.us` |
| `NODE_ENV` | `production` |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` |

### Key Vault Secrets (Sensitive — Never in App Settings)

| Secret Name | Description |
|---|---|
| `SessionSigningSecret` | Cookie signing key |
| `MagicLinkSigningSecret` | Token HMAC key |
| `CosmosDbEndpoint` | Cosmos DB account endpoint |
| `StorageAccountName` | Blob storage account name |
| `AdminGroupObjectId` | Entra ID group ID for admin check |
| `GraphTenantId` | GCCH Entra ID tenant ID |
| `GraphClientId` | Mail sender app registration client ID |
| `MailSenderAddress` | Sender email address |
| `MailSenderCert` | Certificate for Graph auth |

---

## 7. Post-Deployment Verification

Run these checks after every deployment:

```bash
# 1. Confirm App Service is running and HTTPS-only
curl -I https://<your-domain>
# Expect: 200 OK, Strict-Transport-Security header present

# 2. Confirm login page loads (unauthenticated)
curl https://<your-domain>/
# Expect: redirect to /login or 200 with login page

# 3. Confirm protected routes redirect to login
curl -I https://<your-domain>/api/albums
# Expect: 401 or redirect to /login

# 4. Confirm blob storage has no public access
az storage account show \
  --name <storage-account> \
  --resource-group <rg> \
  --query "allowBlobPublicAccess"
# Expected: false

# 5. Confirm WAF is in Prevention mode
az network application-gateway waf-policy show \
  --name <waf-policy> \
  --resource-group <rg> \
  --query "policySettings.mode"
# Expected: "Prevention"

# 6. Check audit log is being written
# Log in via the app, then check Cosmos DB auditlogs container for an entry
```

---

## 8. Ongoing Operations

### Adding a New Permitted Domain

Via the Admin Panel:
1. Log in as an admin
2. Navigate to **Admin → Users → Domain Allowlist**
3. Click **Add Domain** and enter the new domain (e.g., `contractor.com`)

Via direct Cosmos DB (break-glass only):
```json
{
  "id": "uuid-here",
  "domain": "contractor.com",
  "addedAt": "2026-01-01T00:00:00Z",
  "addedBy": "admin@aleutfederal.com",
  "isActive": true
}
```

### Revoking a User

Via Admin Panel:
1. Admin → Users → Find user by email → Revoke Access
2. This immediately invalidates all active sessions and blocklists the email

### Provisioning a Direct User and Assigning Tenant Access

Via Admin Panel:
1. Navigate to **Admin → Users**.
2. In **Direct User Provisioning**, enter the user's email address.
3. (Optional) Select a tenant and tenant role to grant immediate access.
4. Click **Add User**.

Behavior:
- If the user does not exist, a user record is created immediately.
- If the user already exists, the existing user record is reused.
- If a tenant is selected, the tenant membership is created (or reactivated and role-updated if it already exists).
- All provisioning actions are written to the audit log.

### Rotating Key Vault Secrets

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 64)

# Update in Key Vault
az keyvault secret set \
  --vault-name <vault-name> \
  --name SessionSigningSecret \
  --value "$NEW_SECRET"

# Restart app to pick up new secret
az webapp restart \
  --name <app-name> \
  --resource-group <rg>
```

> **Note:** Rotating `SessionSigningSecret` will invalidate all active user sessions. Users will need to re-authenticate via magic link.

### Exporting Audit Logs

Via Admin Panel:
1. Admin → Audit Logs → Set date range → Export CSV

Via Azure Monitor:
```kusto
// Log Analytics KQL query
AzureDiagnostics
| where Category == "DataPlaneRequests"
| where TimeGenerated > ago(30d)
| project TimeGenerated, userEmail_s, action_s, ipAddress_s
```

---

## 9. Troubleshooting

### Magic Links Not Being Received

1. Check App Service logs: Azure Portal → App Service → Log stream
2. Verify Graph app registration has `Mail.Send` permission with admin consent
3. Verify Exchange application access policy is correctly scoped to sender mailbox
4. Verify `MailSenderCert` in Key Vault matches the certificate uploaded to the app registration
5. Test with: `Test-ApplicationAccessPolicy` in Exchange Online PowerShell (see `docs/infrastructure-guide.md` Step 9d)

### "Access Denied" on Admin Pages

1. Confirm the user's email is a member of the `myMedia-Admins` Entra ID group
2. Confirm `AdminGroupObjectId` in Key Vault matches the group's actual Object ID
3. Check that the Graph app has permission to read group members

### SAS URLs Not Working / Media Not Loading

1. Confirm the App Service managed identity has `Storage Blob Data Contributor` role on the storage account
2. Confirm `StorageAccountName` in Key Vault is correct
3. Confirm the blob containers (`media`, `thumbnails`) exist in the storage account
4. Check that SAS URLs use the GCCH endpoint: `*.blob.core.usgovcloudapi.net`

### Key Vault Access Errors

```bash
# Verify role assignment exists
az role assignment list \
  --assignee <app-managed-identity-principal-id> \
  --scope $(az keyvault show --name <vault> --resource-group <rg> --query id --output tsv)
```

### Cosmos DB Connection Issues

```bash
# Verify Cosmos DB role assignment
az cosmosdb sql role assignment list \
  --account-name <cosmos-account> \
  --resource-group <rg>
# App identity should have "Cosmos DB Built-in Data Contributor"
```

---

## Reference: GCCH Endpoints

| Service | Endpoint |
|---|---|
| Azure Portal | `https://portal.azure.us` |
| Azure Resource Manager | `https://management.usgovcloudapi.net` |
| Azure Blob Storage | `https://<account>.blob.core.usgovcloudapi.net` |
| Azure Key Vault | `https://<vault>.vault.usgovcloudapi.net` |
| Microsoft Graph | `https://graph.microsoft.us` |
| Entra ID Token | `https://login.microsoftonline.us/<tenant-id>` |

> **Never use commercial Azure endpoints** (`*.azure.com`, `graph.microsoft.com`, `login.microsoftonline.com`). All GCCH traffic must use the `usgovcloudapi.net` / `microsoft.us` / `microsoftonline.us` domains above.
