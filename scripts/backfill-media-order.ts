/**
 * One-shot migration: assign an `order` value to every media record that
 * doesn't have one. Groups by (tenantId, albumId) and uses the same
 * `uploadedAt DESC` seed the live lazy-backfill uses, so the initial order
 * matches what users currently see in the gallery.
 *
 * Run once after deploying the composite index:
 *   npx tsx scripts/backfill-media-order.ts
 *
 * Idempotent — safe to re-run. Skips items that already have `order`.
 *
 * Prerequisites (same as setup-prod.ts):
 *   az cloud set --name AzureUSGovernment
 *   az login --tenant 8b37dad1-f014-4751-907b-9c53d310a45f
 */

import { CosmosClient } from "@azure/cosmos";
import {
  DefaultAzureCredential,
  AzureAuthorityHosts,
} from "@azure/identity";
import type {
  TokenCredential,
  GetTokenOptions,
  AccessToken,
} from "@azure/core-auth";

class GcchCosmosCredential implements TokenCredential {
  constructor(private readonly inner: TokenCredential) {}
  getToken(
    _scopes: string | string[],
    options?: GetTokenOptions
  ): Promise<AccessToken | null> {
    return this.inner.getToken("https://cosmos.azure.com/.default", options);
  }
}

const COSMOS_ENDPOINT = "https://mymedia-cosmos.documents.azure.us:443/";
const DB_NAME = process.env.COSMOS_DB_NAME ?? "mymedia";

interface MediaDoc {
  id: string;
  tenantId: string;
  albumId: string;
  uploadedAt: string;
  order?: number;
  isDeleted?: boolean;
}

async function main(): Promise<void> {
  console.log("=== Backfill media.order ===\n");

  const credential = new DefaultAzureCredential({
    authorityHost: AzureAuthorityHosts.AzureGovernment,
  });
  const client = new CosmosClient({
    endpoint: COSMOS_ENDPOINT,
    aadCredentials: new GcchCosmosCredential(credential),
  });
  const container = client.database(DB_NAME).container("media");

  console.log("Scanning media container…");
  const { resources: all } = await container.items
    .query<MediaDoc>({
      query:
        "SELECT c.id, c.tenantId, c.albumId, c.uploadedAt, c.order, c.isDeleted FROM c WHERE c.isDeleted = false",
    })
    .fetchAll();

  const byAlbum = new Map<string, MediaDoc[]>();
  for (const record of all) {
    const key = `${record.tenantId}::${record.albumId}`;
    const list = byAlbum.get(key) ?? [];
    list.push(record);
    byAlbum.set(key, list);
  }

  console.log(
    `  ${all.length} media records across ${byAlbum.size} albums\n`
  );

  let totalPatched = 0;
  let totalFailed = 0;

  for (const [key, records] of byAlbum) {
    const [tenantId, albumId] = key.split("::");
    const missing = records.filter((r) => typeof r.order !== "number");
    if (missing.length === 0) {
      continue;
    }

    const existingMax = records.reduce<number>(
      (max, r) => (typeof r.order === "number" && r.order > max ? r.order : max),
      -1
    );
    let nextOrder = existingMax + 1;

    // newest first, matches the sort the gallery used before reordering shipped
    const sorted = [...missing].sort((a, b) => {
      if (a.uploadedAt === b.uploadedAt) {
        return 0;
      }
      return a.uploadedAt < b.uploadedAt ? 1 : -1;
    });

    console.log(
      `album ${albumId} (tenant ${tenantId}): backfilling ${sorted.length} of ${records.length}`
    );

    for (const record of sorted) {
      try {
        await container
          .item(record.id, record.id)
          .patch([{ op: "add", path: "/order", value: nextOrder }]);
        nextOrder += 1;
        totalPatched += 1;
      } catch (err) {
        totalFailed += 1;
        console.warn(
          `  item ${record.id} failed:`,
          (err as Error)?.message ?? err
        );
      }
    }
  }

  console.log(
    `\n=== Done. Patched ${totalPatched}, failed ${totalFailed} ===`
  );
}

main().catch((err) => {
  console.error("\nBackfill failed:", err);
  process.exit(1);
});
