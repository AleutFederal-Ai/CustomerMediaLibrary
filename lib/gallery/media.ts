import { media } from "@/lib/azure/cosmos";
import { MediaRecord } from "@/types";

export async function getMediaById(mediaId: string): Promise<MediaRecord | null> {
  try {
    const mediaContainer = await media();
    const { resource } = await mediaContainer.item(mediaId, mediaId).read<MediaRecord>();

    if (!resource || resource.isDeleted) {
      return null;
    }

    return resource;
  } catch {
    return null;
  }
}
