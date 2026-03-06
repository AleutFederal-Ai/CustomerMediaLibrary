import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobClient,
} from "@azure/storage-blob";
import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import { getSecret } from "./keyvault";

export const CONTAINERS = {
  MEDIA: "media",
  THUMBNAILS: "thumbnails",
} as const;

const SAS_EXPIRY_MINUTES = 15;

let _serviceClient: BlobServiceClient | null = null;
// Shared key credential for dev/Azurite (SAS generation without managed identity)
let _sharedKeyCredential: StorageSharedKeyCredential | null = null;

async function getServiceClient(): Promise<BlobServiceClient> {
  if (_serviceClient) return _serviceClient;

  // Dev/emulator mode: use Azurite connection string
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connectionString) {
    _serviceClient = BlobServiceClient.fromConnectionString(connectionString);
    // Extract shared key credential for SAS generation in dev
    const match = connectionString.match(
      /AccountName=([^;]+);AccountKey=([^;]+)/
    );
    if (match) {
      _sharedKeyCredential = new StorageSharedKeyCredential(match[1], match[2]);
    }
    return _serviceClient;
  }

  // Production: managed identity + GCCH endpoint
  const accountName = await getSecret("StorageAccountName");
  const url = `https://${accountName}.blob.core.usgovcloudapi.net`;
  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });
  _serviceClient = new BlobServiceClient(url, credential);
  return _serviceClient;
}

/**
 * Generate a short-lived (15-minute) read-only SAS URL for a blob.
 * In production: uses user delegation key (managed identity).
 * In dev: uses storage account shared key from connection string.
 */
export async function generateSasUrl(
  containerName: string,
  blobName: string
): Promise<{ sasUrl: string; expiresAt: string }> {
  const client = await getServiceClient();

  const startsOn = new Date();
  const expiresOn = new Date(
    startsOn.getTime() + SAS_EXPIRY_MINUTES * 60 * 1000
  );

  let sasQueryParams: ReturnType<typeof generateBlobSASQueryParameters>;

  if (_sharedKeyCredential) {
    // Dev/Azurite: use shared key credential for SAS
    sasQueryParams = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
      },
      _sharedKeyCredential
    );
  } else {
    // Production: user delegation key (requires managed identity with Storage Blob Data Reader)
    const accountName = await getSecret("StorageAccountName");
    const userDelegationKey = await client.getUserDelegationKey(
      startsOn,
      expiresOn
    );
    sasQueryParams = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn,
        expiresOn,
      },
      userDelegationKey,
      accountName
    );
  }

  // Build URL from the service client's URL (works for both Azurite and prod)
  const serviceUrl = client.url.replace(/\/$/, "");
  const sasUrl = `${serviceUrl}/${containerName}/${blobName}?${sasQueryParams.toString()}`;

  return { sasUrl, expiresAt: expiresOn.toISOString() };
}

export async function getBlobClient(
  containerName: string,
  blobName: string
): Promise<BlobClient> {
  const client = await getServiceClient();
  return client.getContainerClient(containerName).getBlobClient(blobName);
}

export async function uploadBlob(
  containerName: string,
  blobName: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const client = await getServiceClient();
  const blockBlobClient = client
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(data, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function deleteBlob(
  containerName: string,
  blobName: string
): Promise<void> {
  const client = await getServiceClient();
  const blobClient = client
    .getContainerClient(containerName)
    .getBlobClient(blobName);
  await blobClient.deleteIfExists();
}
