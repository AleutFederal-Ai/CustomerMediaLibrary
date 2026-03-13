import CuiBanner from "@/components/ui/CuiBanner";

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CuiBanner />
      {children}
    </>
  );
}
