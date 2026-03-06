import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https://*.blob.core.usgovcloudapi.net",
      "media-src 'self' blob: https://*.blob.core.usgovcloudapi.net",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nextConfig: any = {
  output: "standalone",
  experimental: {
    // Allow Node.js APIs in middleware (needed for Cosmos DB session validation)
    nodeMiddleware: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
