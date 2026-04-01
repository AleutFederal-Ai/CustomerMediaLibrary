import { NextRequest, NextResponse } from "next/server";
import { media } from "@/lib/azure/cosmos";
import { generateSasUrl } from "@/lib/azure/blob";
import { buildDefaultMediaTitle } from "@/lib/media-metadata";
import { MediaRecord, MediaListItem } from "@/types";

/**
 * GET /api/search?q=<query>&albumId=<albumId>&type=image|video&cursor=<token>
 * Server-side search/filter across media items.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const albumId = searchParams.get("albumId");
  const fileType = searchParams.get("type"); // "image" | "video"
  const continuationToken = searchParams.get("cursor") ?? undefined;
  const tenantId = request.headers.get("x-active-tenant-id") ?? "";

  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  }

  const PAGE_SIZE = 48;

  try {
    const container = await media();

    const conditions: string[] = ["c.isDeleted = false", "c.tenantId = @tenantId"];
    const parameters: { name: string; value: string }[] = [
      { name: "@tenantId", value: tenantId },
    ];

    if (albumId) {
      conditions.push("c.albumId = @albumId");
      parameters.push({ name: "@albumId", value: albumId });
    }

    if (fileType === "image" || fileType === "video" || fileType === "link") {
      conditions.push("c.fileType = @fileType");
      parameters.push({ name: "@fileType", value: fileType });
    }

    if (q) {
      conditions.push(
        `(
          CONTAINS(LOWER(c.fileName), @q)
          OR (IS_DEFINED(c.title) AND CONTAINS(LOWER(c.title), @q))
          OR (IS_DEFINED(c.description) AND CONTAINS(LOWER(c.description), @q))
          OR ARRAY_CONTAINS(c.tags, @q)
        )`
      );
      parameters.push({ name: "@q", value: q });
    }

    const queryText = `SELECT * FROM c WHERE ${conditions.join(" AND ")} ORDER BY c.uploadedAt DESC`;

    const iterator = container.items.query<MediaRecord>(
      { query: queryText, parameters },
      {
        maxItemCount: PAGE_SIZE,
        continuationToken,
      }
    );

    const page = await iterator.fetchNext();
    const records = page.resources;

    const items: MediaListItem[] = await Promise.all(
      records.map(async (record) => {
        let thumbnailUrl: string;
        if (record.fileType === "link") {
          // External URL media — use YouTube thumbnail or empty string
          const ytMatch = record.externalUrl?.match(
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]+)/
          );
          thumbnailUrl = ytMatch?.[1]
            ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
            : "";
        } else {
          const { sasUrl } = await generateSasUrl(
            "thumbnails",
            record.thumbnailBlobName
          );
          thumbnailUrl = sasUrl;
        }
        return {
          id: record.id,
          albumId: record.albumId,
          tenantId: record.tenantId,
          fileName: record.fileName,
          title: record.title ?? buildDefaultMediaTitle(record.fileName),
          description: record.description,
          fileType: record.fileType,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
          thumbnailUrl,
          tags: record.tags,
          uploadedAt: record.uploadedAt,
          externalUrl: record.externalUrl,
        };
      })
    );

    return NextResponse.json({
      items,
      continuationToken: page.continuationToken ?? null,
    });
  } catch (err) {
    console.error("[search] GET error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
