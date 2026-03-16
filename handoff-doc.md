# Developer Handoff Document
## Media Gallery — Azure GCCH Infrastructure

> ⚠️ **Naming Note:** Resource names in this document reflect what was actually provisioned in Azure. Where the build specification references "mediagallery" naming conventions, the actual deployed resources use "mymedia" equivalents (e.g. `mymedia-cosmos` instead of `mediagallery-cosmos`). The dev team should use the names in this document, not those in the build spec.

---

## 1. Azure Environment

| Item | Value |
|---|---|
| Azure Cloud | Azure Government (AzureUSGovernment) |
| Portal URL | `https://portal.azure.us` |
| Subscription ID | b2fba6de-c97e-42f2-b4f4-86cfa84a6de0 |
| Tenant ID | 8b37dad1-f014-4751-907b-9c53d310a45f |
| Resource Group | `rg-mymedia-prod` |
| Region | US Gov Virginia |

---

## 2. App Service

| Item | Value |
|---|---|
| App Service Name | `mymedia-app` |
| App Service Plan | `mymedia-plan` (P2V3 Linux) |
| Runtime | Node 20 LTS |
| Default Hostname | `mymedia-app.azurewebsites.us` |
| Managed Identity Principal ID | 8a768bb9-4f65-48c8-8366-e9309a875ab3 |
| HTTPS Only | Enabled |
| Minimum TLS | 1.2 |

### Environment Variables Already Configured
| Name | Value |
|---|---|
| `AZURE_KEY_VAULT_URI` | `https://mymedia-kv.vault.usgovcloudapi.net/` |
| `AZURE_CLOUD` | `AzureUSGovernment` |
| `GRAPH_ENDPOINT` | `https://graph.microsoft.us` |
| `GRAPH_TOKEN_ENDPOINT` | `https://login.microsoftonline.us` |
| `NODE_ENV` | `production` |
| `WEBSITE_RUN_FROM_PACKAGE` | `1` |

---

## 3. Key Vault

| Item | Value |
|---|---|
| Key Vault Name | `mymedia-kv` |
| Key Vault URI | `https://mymedia-kv.vault.usgovcloudapi.net/` |
| Permission Model | Azure RBAC |
| Soft Delete | Enabled (90 days) |
| Purge Protection | Enabled |

### Secrets Stored in Key Vault
| Secret Name | Description |
|---|---|
| `GraphTenantId` | GCCH Entra ID tenant ID |
| `GraphClientId` | MediaGallery-MailSender app registration client ID |
| `MailSenderAddress` | `noreply@aleutfederal.us` |
| `SessionSigningSecret` | Random 64-byte base64 string for session cookie signing |
| `MagicLinkSigningSecret` | Random 64-byte base64 string for magic link token signing |
| `CosmosDbEndpoint` | Cosmos DB account URI |
| `StorageAccountName` | `mymediastor` |
| `AdminGroupObjectId` | MediaGallery-Admins Entra ID security group object ID |

### How to Access Secrets at Runtime
All secrets must be retrieved using `DefaultAzureCredential` from the `@azure/identity` package combined with `@azure/keyvault-secrets`. The app uses its managed identity — no connection strings or passwords in code or environment variables.

```javascript
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();
const client = new SecretClient(process.env.AZURE_KEY_VAULT_URI, credential);
const secret = await client.getSecret("SessionSigningSecret");
```

---

## 4. Azure Blob Storage

| Item | Value |
|---|---|
| Storage Account Name | `mymediastor` |
| Storage Account URL | `https://mymediastor.blob.core.usgovcloudapi.net` |
| Anonymous Access | Disabled |
| Storage Account Key Access | Disabled |
| Authentication Method | Managed identity only |
| Minimum TLS | 1.2 |

### Containers
| Container Name | Purpose |
|---|---|
| `media` | All original media files (images and videos) |
| `thumbnails` | Pre-generated thumbnails for gallery grid view |

### Important
All media URLs served to users must be **short-lived SAS URLs generated server-side**. Never expose direct blob URLs or permanent links to the client. SAS URLs should have a maximum expiry of 15 minutes.

---

## 5. Cosmos DB

| Item | Value |
|---|---|
| Account Name | `mymedia-cosmos` |
| Endpoint URI | https://mymedia-cosmos.documents.azure.us:443/ |
| Database Name | `mediagallery` |
| Capacity Mode | Serverless |
| Authentication | Managed identity (Built-in Data Contributor role assigned) |

### Containers
| Container Name | Partition Key | Purpose |
|---|---|---|
| `sessions` | `/id` | Active user sessions |
| `users` | `/id` | Authenticated user records |
| `albums` | `/id` | Album definitions and metadata |
| `media` | `/id` | Media item metadata |
| `auditlogs` | `/id` | CMMC audit trail |
| `domains` | `/id` | Email domain allowlist |

### Initial Domain Allowlist
The following domains need to be seeded into the `domains` container on first deployment:
- `aleutfederal.com`
- `aleutfederal.us`
- `us.af.mil`
- `ussf.mil`

---

## 6. Microsoft Graph API — Email

| Item | Value |
|---|---|
| App Registration Name | `MediaGallery-MailSender` |
| Client ID | *(from Key Vault — `GraphClientId`)* |
| Tenant ID | *(from Key Vault — `GraphTenantId`)* |
| Graph Endpoint | `https://graph.microsoft.us` |
| Token Endpoint | `https://login.microsoftonline.us/{tenantId}` |
| Permission | `Mail.Send` (application permission, admin consent granted) |
| Sender Address | `noreply@aleutfederal.us` |
| Certificate | `MailSenderCert` stored in Key Vault |
| Mailbox Restriction | Application access policy restricts sending to `noreply@aleutfederal.us` only |

### SDK Configuration
Must use `@microsoft/microsoft-graph-client` configured for the US Government national cloud:

```javascript
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from
  "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

const credential = new ClientSecretCredential(
  tenantId,
  clientId,
  clientSecret,
  { authorityHost: "https://login.microsoftonline.us" }
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ["https://graph.microsoft.us/.default"]
});

const client = Client.initWithMiddleware({
  authProvider,
  baseUrl: "https://graph.microsoft.us/v1.0"
});
```

---

## 7. Networking

| Item | Value |
|---|---|
| Virtual Network | `mymedia-vnet` (`10.0.0.0/16`) |
| App Gateway Subnet | `mymedia-ag-subnet` (`10.0.0.0/24`) |
| App Service Subnet | `mymedia-app-subnet` (`10.0.1.0/24`) |
| App Service VNet Integration | Enabled |
| App Service Access Restriction | Allow App Gateway subnet only, deny all else |

---

## 8. Application Gateway

| Item | Value |
|---|---|
| Name | `mymedia-appgw` |
| SKU | WAF V2 |
| Public IP | `mymedia-appgw-pip` |
| Public IP Address | 52.245.225.20 |
| WAF Policy | `mymedia-waf-policy` |
| WAF Mode | Prevention |
| WAF Ruleset | OWASP 3.2 |
| Autoscaling | Min 1, Max 5 |
| TLS Certificate | Self-signed placeholder — **must be replaced before go-live** |
| Backend Pool | `mymedia-app` App Service |

---

## 9. Entra ID

| Item | Value |
|---|---|
| Admin Security Group | `MediaGallery-Admins` |
| Admin Group Object ID | *(from Key Vault — `AdminGroupObjectId`)* |
| Admin Authentication | Entra ID + MFA enforced at tenant level |

---

## 10. Logging and Monitoring

| Item | Value |
|---|---|
| Log Analytics Workspace | `mymedia-logs` |
| Log Retention | 90 days minimum |
| Diagnostic Logs Configured On | Key Vault, Blob Storage, Cosmos DB, App Service, App Gateway |

---

## 11. Outstanding Items
These must be resolved before go-live. The dev team should be aware of them:

| Item | Owner | Notes |
|---|---|---|
| Custom domain name | Aleut Federal IT / DNS admin | App Gateway public IP is ready to receive an A record |
| Replace self-signed TLS certificate | Aleut Federal IT | Needed once domain is confirmed |
| Seed domain allowlist in Cosmos DB `domains` container | Dev team | Initial domains listed in Section 5 above |
| Rotate `SessionSigningSecret` and `MagicLinkSigningSecret` on a schedule | Ops team | Recommend 90 days, set expiration dates in Key Vault |
| Video file size limits per upload | Product owner | Needed before admin upload UI is built |
| Soft-delete recovery window | Product owner | How long before deleted media is permanently purged |
| Customer logo and brand colors | Aleut Federal | Placeholder used in build — swap via CSS variables |

---

## 12. Reference — GCCH Endpoints
Make sure all SDK and API calls use these government endpoints and never the commercial equivalents:

| Service | GCCH Endpoint |
|---|---|
| Azure Resource Manager | `https://management.usgovcloudapi.net` |
| Azure Blob Storage | `https://<account>.blob.core.usgovcloudapi.net` |
| Azure Key Vault | `https://<vault>.vault.usgovcloudapi.net` |
| Microsoft Graph | `https://graph.microsoft.us` |
| Entra ID Token | `https://login.microsoftonline.us/<tenant-id>` |
| Azure Portal | `https://portal.azure.us` |

---

## 13. Build Specification
The full build specification document — including all feature requirements, authentication flow, gallery features, admin panel, audit logging requirements, and CMMC L2 compliance controls — is contained in:

> **Media Gallery Website — Claude Code Build Spec.md**

The dev team should treat that document as the source of truth for application behavior. This handoff document covers only the infrastructure that has been provisioned to support it.
