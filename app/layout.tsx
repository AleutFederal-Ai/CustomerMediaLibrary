import type { Metadata } from "next";
import { headers } from "next/headers";
import CuiBanner from "@/components/ui/CuiBanner";
import PlatformFooter from "@/components/ui/PlatformFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "myMedia Platform",
  description: "Secure multi-tenant media operations platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers() makes this layout dynamic on every request,
  // which causes Next.js to apply the x-nonce (set by proxy.ts) to
  // its own inline hydration scripts — required for nonce-based CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <body nonce={nonce} className="antialiased">
        <CuiBanner />
        <div className="min-h-[calc(100vh-42px)] bg-[color:var(--background)]">
          {children}
        </div>
        <PlatformFooter />
      </body>
    </html>
  );
}
