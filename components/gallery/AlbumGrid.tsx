"use client";

import { AlbumListItem } from "@/types";
import AlbumCard from "./AlbumCard";

interface Props {
  albums: AlbumListItem[];
}

export default function AlbumGrid({ albums }: Props) {
  if (albums.length === 0) {
    return (
      <div className="text-center py-24 text-slate-500">
        <p className="text-lg">No albums available.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {albums.map((album) => (
        <AlbumCard key={album.id} album={album} />
      ))}
    </div>
  );
}
