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

function buildEmailBody(magicLinkUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #1e3a5f; color: white; padding: 16px 24px; border-radius: 4px 4px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">Aleut Federal Media Gallery</h1>
  </div>
  <div style="background: #f8f9fa; padding: 24px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 4px 4px;">
    <p>You requested a login link for the Aleut Federal Media Gallery.</p>
    <p>Click the button below to sign in. This link expires in <strong>10 minutes</strong> and can only be used once.</p>
    <p style="margin: 32px 0;">
      <a href="${magicLinkUrl}"
         style="background: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
        Sign In to Media Gallery
      </a>
    </p>
    <p style="font-size: 12px; color: #6c757d;">
      If you did not request this link, you can safely ignore this email.<br>
      Do not share this link with anyone.
    </p>
    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">
    <p style="font-size: 11px; color: #6c757d; margin: 0;">
      This system may contain Controlled Unclassified Information (CUI).
      Handle in accordance with applicable laws and organizational policies.
    </p>
  </div>
</body>
</html>
  `.trim();
}
