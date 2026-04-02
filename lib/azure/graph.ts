import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import {
  ClientSecretCredential,
  AzureAuthorityHosts,
} from "@azure/identity";
import { getSecret } from "./keyvault";

// GCCH Graph endpoint
const GRAPH_BASE_URL = process.env.GRAPH_ENDPOINT ?? "https://graph.microsoft.us";
const GRAPH_SCOPE = `${GRAPH_BASE_URL}/.default`;

// Token endpoint for GCCH Entra ID
const GRAPH_TOKEN_ENDPOINT =
  process.env.GRAPH_TOKEN_ENDPOINT ?? "https://login.microsoftonline.us";

let _graphClient: Client | null = null;

async function getGraphClient(): Promise<Client> {
  if (_graphClient) return _graphClient;

  // Authenticate as the myMedia-mailSender app registration.
  // Mail.Send and group-read permissions are granted to this app registration,
  // not to the managed identity, so we must use its client credentials.
  const [tenantId, clientId, clientSecret] = await Promise.all([
    getSecret("GraphTenantId"),
    getSecret("GraphClientId"),
    getSecret("GraphClientSecret"),
  ]);

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret, {
    authorityHost: `${GRAPH_TOKEN_ENDPOINT}/`,
  });

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: [GRAPH_SCOPE],
  });

  _graphClient = Client.initWithMiddleware({
    authProvider,
    baseUrl: GRAPH_BASE_URL,  // SDK appends /v1.0 itself — do NOT include it here
  });

  return _graphClient;
}

/**
 * Send a magic link email via Microsoft Graph.
 * In Docker dev mode (DOCKER_DEV=true), logs to console instead.
 */
export async function sendMagicLinkEmail(
  toEmail: string,
  magicLinkUrl: string
): Promise<void> {
  if (process.env.DOCKER_DEV === "true") {
    console.log(`[DEV] Magic link for ${toEmail}: ${magicLinkUrl}`);
    return;
  }

  const senderAddress = await getSecret("MailSenderAddress");
  const graphClient = await getGraphClient();

  const message = {
    subject: "Your Media Gallery Login Link",
    body: {
      contentType: "HTML",
      content: buildEmailBody(magicLinkUrl),
    },
    toRecipients: [
      {
        emailAddress: { address: toEmail },
      },
    ],
  };

  // Send as the mail sender mailbox using application permissions
  await graphClient
    .api(`/users/${senderAddress}/sendMail`)
    .post({ message, saveToSentItems: false });
}

// Comma-separated list of emails treated as super-admins in DOCKER_DEV mode.
// Defaults include the standard dev bypass account and the seeded admin account.
// Override with DEV_ADMIN_EMAILS=email1,email2 in your .env.docker if needed.
const DEV_ADMIN_EMAILS = (
  process.env.DEV_ADMIN_EMAILS ?? "dev@aleutfederal.com,admin@admin.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Check if a user's email is a member of the admin Entra ID group.
 * In Docker dev mode, emails in DEV_ADMIN_EMAILS are always treated as admin.
 */
export async function isAdminGroupMember(email: string): Promise<boolean> {
  if (process.env.DOCKER_DEV === "true" && DEV_ADMIN_EMAILS.includes(email.toLowerCase())) {
    return true;
  }

  try {
    const adminGroupId = await getSecret("AdminGroupObjectId");
    const graphClient = await getGraphClient();

    // Get group members (up to 999 — sufficient for admin groups)
    const response = await graphClient
      .api(`/groups/${adminGroupId}/members`)
      .select("mail,userPrincipalName")
      .top(999)
      .get();

    const members: Array<{ mail?: string; userPrincipalName?: string }> =
      response.value ?? [];

    const emailLower = email.toLowerCase();
    return members.some(
      (m) =>
        m.mail?.toLowerCase() === emailLower ||
        m.userPrincipalName?.toLowerCase() === emailLower
    );
  } catch {
    // Do not allow admin access on Graph failure — fail closed
    return false;
  }
}

/**
 * Escape a URL for safe embedding in HTML attributes and text content.
 * Ensures & characters become &amp; so email clients do not mangle
 * multi-parameter query strings.
 */
function htmlEscapeUrl(url: string): string {
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEmailBody(magicLinkUrl: string): string {
  const safeUrl = htmlEscapeUrl(magicLinkUrl);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Media Gallery Login Link</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">

          <!-- Branded header — no images, pure HTML/CSS -->
          <tr>
            <td style="background-color: #1e3a5f; padding: 20px 28px;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="padding-right: 14px; vertical-align: middle; width: 44px;">
                    <!-- Lock icon: text-based, no external image -->
                    <div style="width: 40px; height: 40px; background-color: rgba(255,255,255,0.15); border-radius: 8px; text-align: center; vertical-align: middle; font-size: 18px; line-height: 40px; color: #ffffff;">
                      &#128274;
                    </div>
                  </td>
                  <td style="vertical-align: middle;">
                    <div style="color: #ffffff; font-size: 17px; font-weight: bold; line-height: 1.2; margin: 0;">Aleut Federal Media Gallery</div>
                    <div style="color: #bfdbfe; font-size: 11px; margin-top: 3px;">Controlled Unclassified Information</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px 8px;">
              <p style="margin: 0 0 8px; font-size: 20px; font-weight: bold; color: #1e293b;">Sign in to Media Gallery</p>
              <p style="margin: 0 0 28px; font-size: 14px; color: #64748b; line-height: 1.6;">
                You requested a one-time login link. Click the button below to sign in.
                This link expires in <strong style="color: #1e293b;">10 minutes</strong> and can only be used once.
              </p>

              <!-- CTA button — table-based for Outlook compatibility -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center" bgcolor="#1e3a5f" style="border-radius: 8px; background-color: #1e3a5f;">
                    <a href="${safeUrl}" target="_blank"
                       style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 15px; font-weight: bold; text-decoration: none; border-radius: 8px; mso-padding-alt: 14px 32px;">
                      &#9654;&nbsp; Sign In to Media Gallery
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Copy/paste fallback -->
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 11px; word-break: break-all; line-height: 1.6;">
                <a href="${safeUrl}" style="color: #1e3a5f; text-decoration: underline;">${safeUrl}</a>
              </p>

              <p style="margin: 0 0 28px; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                If you did not request this link, you can safely ignore this email.
                Do not share this link with anyone.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 28px 20px; border-top: 1px solid #e2e8f0; background-color: #f8fafc;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.6;">
                This system may contain Controlled Unclassified Information (CUI).
                Handle in accordance with applicable laws, regulations, and organizational policies.
                Unauthorized disclosure is prohibited.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
