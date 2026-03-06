"use client";

interface Props {
  src: string;
  mimeType: string;
  fileName: string;
}

/**
 * Native HTML5 video player only — no third-party libraries.
 */
export default function VideoPlayer({ src, mimeType, fileName }: Props) {
  return (
    <video
      controls
      playsInline
      className="max-h-[80vh] max-w-full rounded"
      aria-label={fileName}
    >
      <source src={src} type={mimeType} />
      Your browser does not support HTML5 video.
    </video>
  );
}
