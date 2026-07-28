import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  fallbacks: {
    document: "/",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        // API freshness is owned by TanStack Query (~1 min). Never serve
        // hour-old Workbox snapshots for mutable user data.
        urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: {
          cacheName: "api-network-only",
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  turbopack: {
    root: process.cwd(),
  },
};

export default withPWA(nextConfig);
