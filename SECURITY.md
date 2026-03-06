# SECURITY.md — Media Gallery | Aleut Federal
## Threat Model & CMMC Level 2 Compliance Mapping

> **Classification:** CUI — Handle per organizational policy
> **Last Updated:** See git history
> **Owner:** Aleut Federal IT / Security Team

---

## 1. System Description

The Media Gallery is a web application hosted in Azure Government Community Cloud High (GCCH) that allows authorized personnel to view, stream, and download images and videos. The system processes and stores Controlled Unclassified Information (CUI) and is required to meet CMMC Level 2 controls.

**Data sensitivity:** CUI — Not classified, but subject to safeguarding requirements under 32 CFR Part 2002 and DFARS 252.204-7012.

---

## 2. Trust Boundaries

```
[ Public Internet ]
        │
        ▼  (TLS 1.2+)
[ Azure Application Gateway v2 + WAF ]  ← GCCH, FedRAMP High
        │
        ▼  (Private subnet only)
[ Azure App Service — Next.js SSR ]     ← GCCH, no public endpoint
        │
   ┌────┴────────────────────────────┐
   ▼                 ▼               ▼
[ Blob Storage ]  [ Cosmos DB ]  [ Key Vault ]   ← GCCH, managed identity only
        
   ↕ (Microsoft Graph via GCCH endpoint)
[ Exchange Online GCC High — noreply mailbox ]
```

**Key trust boundary rules:**
- The App Service is the only compute boundary. No client-side logic handles secrets, tokens, or blob URLs.
- All external traffic must traverse the Application Gateway WAF.
- All internal service calls use managed identity — no stored credentials.
- Blob Storage has no public endpoint. No SAS token ever reaches a browser in raw form — they are fetched via API, used immediately, and expire in 15 minutes.

---

## 3. Threat Model (STRIDE)

### 3.1 Spoofing

| Threat | Mitigation |
|---|---|
| Attacker impersonates a valid user by guessing or stealing a session cookie | Session cookies are `httpOnly` (not readable by JS), `secure` (HTTPS only), `sameSite=strict` (CSRF protection). Session IDs are random 256-bit values stored server-side in Cosmos DB. |
| Attacker intercepts a magic link in transit | Magic links are single-use, expire in 10 minutes, and are transmitted over TLS. The token stored in DB is a SHA-256 hash — the raw token only exists in the email. |
| Attacker crafts a fake magic link with a guessed token | Tokens are 32 bytes of cryptographic randomness (`crypto.randomBytes(32)`). Brute-force is computationally infeasible. |
| Attacker attempts to authenticate with a non-permitted email domain | Domain is validated server-side against Cosmos DB allowlist before any token is issued. Response is identical for valid and invalid domains (no enumeration). |

### 3.2 Tampering

| Threat | Mitigation |
|---|---|
| Attacker modifies session cookie to elevate privileges | Session cookie contains only a random session ID. Privilege data (email, admin status) is stored server-side in Cosmos DB and fetched on each request. |
| Attacker tampers with media metadata in transit | All API responses served over TLS 1.2+. HSTS enforced. |
| Attacker modifies audit log records | Audit logs are append-only in Cosmos DB. No update or delete API exists for audit records. Admin UI has no delete capability for logs. |
| Attacker injects malicious content via upload | File uploads are server-side only. File type is validated server-side (MIME type + extension + magic bytes check). Files are stored in private blob containers. |

### 3.3 Repudiation

| Threat | Mitigation |
|---|---|
| User denies viewing or downloading sensitive media | Every media view and download is logged in the audit log with timestamp, email, IP, and file ID. Logs are append-only and mirrored to Azure Monitor. |
| Admin denies making configuration changes | All admin actions (upload, delete, domain changes, user revocation) are audit logged with admin email. |

### 3.4 Information Disclosure

| Threat | Mitigation |
|---|---|
| Attacker accesses blob storage directly | Storage account has `allowBlobPublicAccess: false`. No public endpoint. All access via managed identity or time-limited SAS URLs generated server-side. |
| Attacker extracts secrets from environment variables or source code | No secrets in source code or `.env`. All secrets stored in Azure Key Vault, accessed via managed identity. |
| Attacker enumerates valid email addresses via auth endpoint | Auth endpoint always returns the same message regardless of domain validity. |
| Attacker reads session data from cookie | Cookie value is a random session ID only. All session data is server-side. |
| Media blob URLs exposed to client | SAS URLs are generated server-side, returned to client with 15-minute expiry, and never logged. Client uses them directly for rendering only. |
| Sensitive data in Next.js client bundle | All sensitive operations are in API routes (server-side). No Azure SDK calls, Key Vault references, or Cosmos DB queries in client components. |

### 3.5 Denial of Service

| Threat | Mitigation |
|---|---|
| Attacker floods the magic link endpoint to exhaust email quota | Rate limit: 5 requests per email per 15 minutes, 20 per IP per 15 minutes. Returns HTTP 429. |
| Attacker downloads bulk zips to exhaust bandwidth or compute | Bulk download is server-streamed. Consider file count and size limits per request (implement before go-live). |
| Attacker sends malformed requests to crash the API | Input validation on all API routes. Azure WAF (OWASP 3.2, Prevention mode) blocks common attack patterns at the gateway. |

### 3.6 Elevation of Privilege

| Threat | Mitigation |
|---|---|
| Regular user accesses admin routes | `middleware.ts` validates session on every request. Admin routes additionally check Entra ID group membership via Microsoft Graph. These are two independent checks. |
| Attacker exploits a broken access control bug to reach an unprotected route | Middleware runs on all routes by default; `/login` and `/api/auth/*` are explicitly excluded. Any new route is protected unless explicitly added to the exclusion list. |
| Attacker uses XSS to steal session cookie | Cookie is `httpOnly` — not accessible to JavaScript. CSP headers restrict script execution to `'self'` only. No `eval`, no inline scripts. |

---

## 4. CMMC Level 2 Control Mapping

### AC — Access Control

| Practice | Requirement | Implementation |
|---|---|---|
| AC.L2-3.1.1 | Limit system access to authorized users | Magic link auth with domain allowlist; all routes session-gated via middleware |
| AC.L2-3.1.2 | Limit system access to authorized transaction types | Authenticated users access gallery only; admin functions require Entra ID group membership |
| AC.L2-3.1.3 | Control flow of CUI | Media served via short-lived SAS URLs; no direct blob access; server-side zip generation |
| AC.L2-3.1.10 | Use session lock after inactivity | 60-minute idle timeout enforced server-side |
| AC.L2-3.1.11 | Terminate sessions after defined conditions | Absolute 8-hour session max; idle timeout; manual revocation capability |

### AU — Audit & Accountability

| Practice | Requirement | Implementation |
|---|---|---|
| AU.L2-3.3.1 | Create and retain audit logs | All events in Section 9 of build spec logged to Cosmos DB + Azure Monitor |
| AU.L2-3.3.2 | Ensure actions of individuals can be traced | Every log entry includes email, IP, timestamp, action, and detail payload |
| AU.L2-3.3.3 | Review and update logged events | Audit log viewer in admin panel; CSV export; Azure Monitor dashboards |

### CM — Configuration Management

| Practice | Requirement | Implementation |
|---|---|---|
| CM.L2-3.4.1 | Establish baseline configurations | Infrastructure defined in Bicep IaC; deployed from source control |
| CM.L2-3.4.2 | Establish and enforce security settings | No hardcoded secrets; managed identity; WAF in Prevention mode; TLS 1.2 minimum |

### IA — Identification & Authentication

| Practice | Requirement | Implementation |
|---|---|---|
| IA.L2-3.5.1 | Identify system users | Email-based identity; every session tied to a verified email address |
| IA.L2-3.5.2 | Authenticate identity before allowing access | Magic link (single-use, time-limited) required before any session is issued |
| IA.L2-3.5.3 | Use MFA for privileged accounts | Admin authentication via Entra ID with MFA enforced at the directory level |

### MP — Media Protection

| Practice | Requirement | Implementation |
|---|---|---|
| MP.L2-3.8.1 | Protect system media | Blob storage private-only; no public endpoints; SAS URLs expire in 15 minutes |
| MP.L2-3.8.2 | Limit access to CUI on media | Access requires authenticated session; domain allowlist; admin revocation |

### SC — System & Communications Protection

| Practice | Requirement | Implementation |
|---|---|---|
| SC.L2-3.13.1 | Monitor and control communications | All traffic through App Gateway WAF; App Service not internet-facing |
| SC.L2-3.13.2 | Employ architectural security | Defense in depth: WAF → App Service → managed identity → Key Vault |
| SC.L2-3.13.5 | Implement subnetworks for publically accessible system components | App Gateway in public subnet; App Service in private subnet with VNet integration |
| SC.L2-3.13.8 | Implement cryptographic mechanisms | TLS 1.2+ enforced; HSTS; httpOnly secure cookies; tokens hashed with SHA-256 |
| SC.L2-3.13.15 | Protect CUI at rest and in transit | Blob storage encryption at rest (Azure-managed keys); TLS in transit |

### SI — System & Information Integrity

| Practice | Requirement | Implementation |
|---|---|---|
| SI.L2-3.14.1 | Identify, report, and correct system flaws | `npm audit` in CI/CD pipeline; fail on high/critical CVEs |
| SI.L2-3.14.3 | Monitor security alerts | Azure Monitor alerts for failed logins, 5xx errors; WAF firewall logs |

---

## 5. Known Residual Risks

| Risk | Likelihood | Impact | Mitigation / Acceptance |
|---|---|---|---|
| Magic link delivered to compromised email inbox | Low | High | 10-minute expiry limits window; single-use prevents replay |
| Insider threat (authorized user exfiltrates media) | Low-Medium | High | All downloads audit logged; admin can revoke individual users |
| Azure service outage affecting GCCH region | Low | High | Cosmos DB backup enabled; media in durable Blob Storage |
| Zero-day in Next.js or Node.js runtime | Medium | High | App Service managed runtime updates; `npm audit` in pipeline |
| Bulk download abuse (large volume extraction) | Medium | Medium | Audit log captures all bulk downloads; rate limiting to be configured |

---

## 6. Secrets Inventory

All secrets are stored in Azure Key Vault. **No secret appears in source code, `.env` files, or App Service config in plaintext.**

| Key Vault Secret Name | Description | Rotation Policy |
|---|---|---|
| `SessionSigningSecret` | HMAC key for session cookie signing | Rotate every 90 days |
| `MagicLinkSigningSecret` | HMAC key for magic link token generation | Rotate every 90 days |
| `CosmosDbEndpoint` | Cosmos DB account endpoint URI | On resource change |
| `StorageAccountName` | Blob storage account name | On resource change |
| `AdminGroupObjectId` | Entra ID group object ID for admin check | On group change |
| `GraphTenantId` | GCCH Entra ID tenant ID | On tenant change |
| `GraphClientId` | App registration client ID for mail sending | On app reg change |
| `MailSenderAddress` | `noreply@...` Exchange Online mailbox | On mailbox change |
| `MailSenderCert` | Certificate for Graph API app auth | Rotate annually |

---

## 7. Incident Response

If a security incident is suspected:

1. **Immediate:** Revoke the affected user's session via the admin panel (Users → Revoke Access)
2. **Short-term:** Export and review audit logs for the affected user and time window
3. **If compromise is confirmed:** Rotate affected Key Vault secrets immediately; notify Aleut Federal security team
4. **Escalation contact:** [To be filled in by Aleut Federal security team]

For Key Vault secret rotation:
```bash
az keyvault secret set --vault-name <vault> --name <secret-name> --value "<new-value>"
# Then restart App Service to pick up new secrets
az webapp restart --name <app-name> --resource-group <rg>
```

---

## 8. Security Review Checklist (Pre-Go-Live)

- [ ] Penetration test completed by qualified third party
- [ ] `npm audit` returns zero high/critical findings
- [ ] WAF rules reviewed and tuned for the application's traffic patterns
- [ ] All Key Vault secrets rotated from initial setup values
- [ ] Admin group membership audited — only appropriate personnel
- [ ] Audit log retention verified (90+ days in Cosmos DB)
- [ ] TLS configuration verified (SSL Labs grade A or better)
- [ ] CSP header validated (no CSP violations in browser console)
- [ ] HSTS preload submission considered
- [ ] Formal ATO review initiated if required by contract
