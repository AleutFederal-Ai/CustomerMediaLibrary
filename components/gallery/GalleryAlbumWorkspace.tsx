"use client";

import { useState } from "react";
import { AlbumListItem } from "@/types";
import AlbumCard from "@/components/gallery/AlbumCard";
import CreateAlbumCard from "@/components/gallery/CreateAlbumCard";

interface Props {
  initialAlbums: AlbumListItem[];
  canCreate: boolean;
  tenantId: string;
}

export default function GalleryAlbumWorkspace({
  initialAlbums,
  canCreate,
  tenantId,
}: Props) {
  const [albums, setAlbums] = useState(initialAlbums);

  const orderedAlbums = [...albums].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  function handleAlbumCreated(created: AlbumListItem) {
    setAlbums((current) => {
      const withoutDuplicate = current.filter((album) => album.id !== created.id);
      return [...withoutDuplicate, created];
    });
  }

  if (albums.length === 0 && !canCreate) {
    return (
      <div className="ops-empty">
        <p className="text-lg font-semibold text-white">
          No albums are currently available.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm">
          This tenant does not have any published content yet. Contact a tenant
          administrator if you expected to see media here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {canCreate ? (
        <CreateAlbumCard tenantId={tenantId} onCreated={handleAlbumCreated} />
      ) : null}
      {orderedAlbums.map((album) => (
        <AlbumCard key={album.id} album={album} />
      ))}
    </div>
  );
}
