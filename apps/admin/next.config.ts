import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  logging: { incomingRequests: { ignore: [/^\/api\/auth\/callback\/datagsm(?:[/?]|$)/] } },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingExcludes: { "/*": ["./.data/**/*", "./.env*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The admin site must never be framed (clickjacking) or load plugins.
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
