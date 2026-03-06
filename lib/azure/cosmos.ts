import { CosmosClient, Container, Database } from "@azure/cosmos";
import { DefaultAzureCredential, AzureAuthorityHosts } from "@azure/identity";
import { getSecret } from "./keyvault";

const DB_NAME = "mediagallery";

export const CONTAINERS = {
  SESSIONS: "sessions",
  USERS: "users",
  ALBUMS: "albums",
  MEDIA: "media",
  AUDIT_LOGS: "auditlogs",
  DOMAINS: "domains",
} as const;

let _client: CosmosClient | null = null;
let _db: Database | null = null;

async function getClient(): Promise<CosmosClient> {
  if (_client) return _client;

  // Dev/emulator mode: COSMOS_CONNECTION_STRING uses key-based auth (emulator)
  const connectionString = process.env.COSMOS_CONNECTION_STRING;
  if (connectionString) {
    _client = new CosmosClient(connectionString);
    return _client;
  }

  // Production: endpoint from Key Vault + managed identity
  const endpoint = await getSecret("CosmosDbEndpoint");
  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });
  _client = new CosmosClient({ endpoint, aadCredentials: credential });
  return _client;
}

async function getDatabase(): Promise<Database> {
  if (_db) return _db;
  const client = await getClient();
  _db = client.database(DB_NAME);
  return _db;
}

export async function getContainer(name: string): Promise<Container> {
  const db = await getDatabase();
  return db.container(name);
}

export const sessions = () => getContainer(CONTAINERS.SESSIONS);
export const users = () => getContainer(CONTAINERS.USERS);
export const albums = () => getContainer(CONTAINERS.ALBUMS);
export const media = () => getContainer(CONTAINERS.MEDIA);
export const auditLogs = () => getContainer(CONTAINERS.AUDIT_LOGS);
export const domains = () => getContainer(CONTAINERS.DOMAINS);
