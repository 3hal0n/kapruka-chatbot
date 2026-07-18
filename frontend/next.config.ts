import type { NextConfig } from "next";

// Backend origin the /api/* rewrite proxies to. Not NEXT_PUBLIC_* — this
// only needs to be visible to the Next.js server/build process, never the
// client bundle (the client now only ever calls relative /api/... paths).
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
