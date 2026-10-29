import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  logging: { incomingRequests: { ignore: [/^\/api\/auth\/callback\/datagsm(?:[/?]|$)/] } },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingExcludes: { "/*": ["./.data/**/*", "./.env*"] },
};

export default nextConfig;
