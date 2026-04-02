# n8n Monitoring Bot — Media Gallery Automated Health & Issue Resolution

This guide explains how to set up an n8n workflow that periodically monitors the Media Gallery platform, detects issues, and takes corrective action.

---

## Overview

The Media Gallery exposes a **diagnostics endpoint** (`GET /api/admin/diagnostics`) that returns comprehensive system health data. An n8n bot can poll this endpoint on a schedule, evaluate the results, and trigger remediation workflows when problems are detected.

### What the Bot Can Monitor

| Signal | Source | Action |
|---|---|---|
| Infrastructure degraded (Cosmos, Blob, KV, Graph) | `infrastructure.checks` | Alert ops team, retry after backoff |
| Cosmos DB collection unreachable | `cosmosCollections` | Alert with specific collection name |
| Elevated auth failure rate | `auditSummary.errorActions` | Check for brute force, block IP if needed |
| Magic link failures spiking | `auditSummary.errorActions` | Verify Key Vault connectivity, check MagicLinkSigningSecret |
| Zero active sessions | `sessionStats.activeSessions` | Possible app restart or auth breakage |
| Specific user errors in audit log | `auditSummary.recentEntries` | Auto-respond or escalate |
| HTTP 503 from diagnostics endpoint | Response status | Full outage — escalate immediately |

---

## Prerequisites

1. **n8n instance** — self-hosted or n8n.cloud
2. **Platform admin account** — the bot needs a session cookie from a super-admin user
3. **Password-based auth** — set a password on the bot's admin account via `POST /api/admin/users/set-password` so the bot can programmatically authenticate

### Create the Bot User

```bash
# From the admin panel or via API, create a user with platform admin access
# Then set a password for automated login:
curl -X POST https://mymedia.aleutfederal.us/api/admin/users/set-password \
  -H "Content-Type: application/json" \
  -H "Cookie: mg_session=<your-admin-session>" \
  -d '{"email": "bot@aleutfederal.us", "password": "<strong-random-password>"}'
```

Store the bot credentials in n8n's **Credentials** store (type: "Header Auth" or custom).

---

## Workflow 1: Periodic Health Check (Every 5 Minutes)

### Nodes

#### 1. Schedule Trigger
- **Type:** Schedule Trigger
- **Interval:** Every 5 minutes

#### 2. Authenticate (HTTP Request)
- **Method:** POST
- **URL:** `https://mymedia.aleutfederal.us/api/auth/password`
- **Body (JSON):**
  ```json
  {
    "email": "bot@aleutfederal.us",
    "password": "{{ $credentials.botPassword }}"
  }
  ```
- **Options:** Follow redirects = OFF, Full response = ON
- Extract the `set-cookie` header from the response for use in subsequent requests

#### 3. Fetch Diagnostics (HTTP Request)
- **Method:** GET
- **URL:** `https://mymedia.aleutfederal.us/api/admin/diagnostics`
- **Headers:**
  ```
  Cookie: {{ $node["Authenticate"].json.headers["set-cookie"] }}
  ```
- **Options:** Full response = ON

#### 4. Evaluate Health (Code Node — JavaScript)
```javascript
const response = $input.first().json;
const status = response.statusCode;
const body = response.body;

const issues = [];

// Check overall status
if (status === 503 || body.overallStatus === "degraded") {
  issues.push({
    severity: "critical",
    message: `System degraded: ${body.overallStatus}`,
    details: body.infrastructure,
  });
}

// Check individual infrastructure services
if (body.infrastructure?.checks) {
  for (const [service, check] of Object.entries(body.infrastructure.checks)) {
    if (check.ok === false) {
      issues.push({
        severity: "critical",
        message: `${service} is DOWN: ${check.message}`,
        latencyMs: check.latencyMs,
      });
    } else if (check.latencyMs > 5000) {
      issues.push({
        severity: "warning",
        message: `${service} is slow: ${check.latencyMs}ms`,
        latencyMs: check.latencyMs,
      });
    }
  }
}

// Check Cosmos collections
if (body.cosmosCollections) {
  for (const col of body.cosmosCollections) {
    if (!col.reachable) {
      issues.push({
        severity: "critical",
        message: `Cosmos collection "${col.name}" unreachable: ${col.error}`,
      });
    }
  }
}

// Check for auth failure spikes
if (body.auditSummary?.errorActions) {
  for (const action of body.auditSummary.errorActions) {
    if (action.count > 20) {
      issues.push({
        severity: "warning",
        message: `High ${action.action} count in 24h: ${action.count}`,
      });
    }
  }
}

// Check session health
if (body.sessionStats?.activeSessions === 0) {
  issues.push({
    severity: "warning",
    message: "Zero active sessions — possible auth system failure",
  });
}

return [{
  json: {
    timestamp: new Date().toISOString(),
    overallStatus: body.overallStatus,
    issueCount: issues.length,
    issues,
    diagnostics: body,
  }
}];
```

#### 5. Route by Severity (Switch Node)
- **Condition:** `{{ $json.issueCount > 0 }}`
- **True branch:** → Alert nodes
- **False branch:** → End (healthy, no action)

#### 6a. Alert — Slack / Email (critical issues)
- Filter for `severity === "critical"`
- Send to Slack channel or email distribution list
- Include: timestamp, issue messages, raw diagnostics link

#### 6b. Log — Record Check (all runs)
- Append result to a Google Sheet, Airtable, or database for trending
- Fields: timestamp, overallStatus, issueCount, sessionCount, latencies

---

## Workflow 2: Audit Log Monitor (Every 15 Minutes)

Focuses on detecting security-relevant patterns in the audit log.

### Nodes

#### 1. Schedule Trigger
- **Interval:** Every 15 minutes

#### 2. Authenticate
- Same as Workflow 1

#### 3. Fetch Diagnostics
- Same as Workflow 1

#### 4. Analyze Audit Patterns (Code Node)
```javascript
const body = $input.first().json.body;
const recent = body.auditSummary?.recentEntries || [];
const errorActions = body.auditSummary?.errorActions || [];

const alerts = [];

// Detect brute force: many MAGIC_LINK_FAILED or PASSWORD_LOGIN_FAILED
const loginFailures = errorActions.filter(
  (a) => a.action.includes("FAILED") && a.count > 10
);
if (loginFailures.length > 0) {
  alerts.push({
    type: "brute_force_suspected",
    message: `Elevated login failures: ${loginFailures.map(f => `${f.action}=${f.count}`).join(", ")}`,
    actions: loginFailures,
  });
}

// Detect rate limiting hits
const rateLimited = errorActions.find(
  (a) => a.action === "magic_link_rate_limited"
);
if (rateLimited && rateLimited.count > 5) {
  alerts.push({
    type: "rate_limit_triggered",
    message: `Rate limiting triggered ${rateLimited.count} times in 24h`,
  });
}

// Detect repeated failures from same user
const failedUsers = {};
for (const entry of recent) {
  if (entry.action.includes("FAILED")) {
    failedUsers[entry.userEmail] = (failedUsers[entry.userEmail] || 0) + 1;
  }
}
for (const [email, count] of Object.entries(failedUsers)) {
  if (count >= 3) {
    alerts.push({
      type: "user_repeated_failures",
      message: `User ${email} has ${count} recent failures`,
      email,
    });
  }
}

return [{ json: { alertCount: alerts.length, alerts } }];
```

#### 5. Take Action (Switch + HTTP Request)
- **brute_force_suspected:** Send Slack alert to security channel
- **rate_limit_triggered:** Log for review, send email summary
- **user_repeated_failures:** Optionally auto-block the user via `POST /api/admin/users` with `{ "email": "...", "action": "block" }`

---

## Workflow 3: Auto-Remediation (Advanced)

For issues that can be fixed automatically.

### Remediation Actions

| Issue | Automated Fix | API Call |
|---|---|---|
| Blocked user flooding login | Already handled by rate limiter | Monitor only |
| Suspicious user with many failures | Block the account | `POST /api/admin/users` `{"email":"...","action":"block"}` |
| Magic link failures (KV issue) | Restart app to clear cached secrets | Azure REST API or manual alert |
| Degraded Cosmos DB | No auto-fix — alert ops | Slack/email notification |
| Sessions not being created | Check KV + Cosmos, alert if both down | Chain diagnostic checks |

### Auto-Block Suspicious User (Code Node)

```javascript
// Only auto-block if the user has 10+ failures in recent entries
// AND is not a known admin email
const PROTECTED_EMAILS = ["admin@admin.com", "bot@aleutfederal.us"];
const alerts = $input.first().json.alerts;

const toBlock = alerts
  .filter((a) => a.type === "user_repeated_failures" && a.count >= 10)
  .filter((a) => !PROTECTED_EMAILS.includes(a.email));

return toBlock.map((a) => ({ json: { email: a.email, action: "block" } }));
```

Then pass each item to an HTTP Request node:
- **Method:** POST
- **URL:** `https://mymedia.aleutfederal.us/api/admin/users`
- **Body:** `{{ $json }}`
- **Headers:** Cookie from auth step

---

## Authentication Pattern for All Workflows

Every workflow that calls a protected API must authenticate first. Here's the reusable pattern:

```
[Schedule Trigger] → [POST /api/auth/password] → [Extract Cookie] → [API Call with Cookie]
```

The password login returns a `redirectTo` field on success and sets a `mg_session` cookie. Extract it from the response headers:

```javascript
// In a Code node after the auth request
const setCookie = $input.first().json.headers["set-cookie"];
// Parse the mg_session value
const match = setCookie?.match(/mg_session=([^;]+)/);
const sessionCookie = match ? `mg_session=${match[1]}` : "";
return [{ json: { cookie: sessionCookie } }];
```

Use `{{ $node["Extract Cookie"].json.cookie }}` in the Cookie header of all subsequent requests.

---

## Environment Variables

Add to your n8n environment or credential store:

| Variable | Value |
|---|---|
| `MYMEDIA_BASE_URL` | `https://mymedia.aleutfederal.us` |
| `BOT_EMAIL` | `bot@aleutfederal.us` |
| `BOT_PASSWORD` | Stored in n8n Credentials (never in workflow JSON) |
| `SLACK_WEBHOOK_URL` | Your Slack incoming webhook for alerts |
| `ALERT_EMAIL` | Distribution list for critical alerts |

---

## Monitoring Dashboard (Optional)

Use the data collected by Workflow 1 to build a simple dashboard:

1. **Google Sheets / Airtable:** Append each health check result as a row
2. **Columns:** Timestamp, Overall Status, Cosmos Latency, Blob Latency, KV Latency, Graph Latency, Active Sessions, Issue Count
3. **Chart:** Plot latencies and session counts over time
4. **Conditional formatting:** Highlight rows where status = "degraded"

Alternatively, query Azure Log Analytics directly using the Azure Monitor REST API for deeper log analysis.

---

## Recommended Schedule Summary

| Workflow | Interval | Purpose |
|---|---|---|
| Health Check | Every 5 minutes | Infrastructure + service availability |
| Audit Monitor | Every 15 minutes | Security event pattern detection |
| Auto-Remediation | Triggered by Audit Monitor | Block suspicious accounts |
| Session Report | Daily at 06:00 UTC | Email summary of 24h activity |

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Bot gets 401 on diagnostics | Session expired (60-min idle) | Re-authenticate before each workflow run |
| Bot gets 403 on diagnostics | Bot user is not a platform admin | Ensure `isPlatformAdmin: true` in users collection |
| Empty audit summary | No audit events in 24h | Normal for low-traffic periods |
| Diagnostics returns 503 | Cosmos DB or Key Vault is down | This IS the alert — escalate to ops |
| Cookie not extracted | Password login failed | Check bot credentials, rate limiting |
