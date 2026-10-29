import type { NextConfig } from "next";
import { PAGE_IDS } from "./lib/routes";

const pages = Object.entries(PAGE_IDS);

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // Pages are shown under random IDs instead of their names (see lib/routes.ts).
  // Old named addresses forward to the ID so bookmarks keep working.
  async redirects() {
    return pages.flatMap(([name, id]) => [
      { source: `/${name}`, destination: `/${id}`, permanent: false },
      { source: `/${name}/:path*`, destination: `/${id}/:path*`, permanent: false },
    ]);
  },
  // The ID address shows the real page, while the address bar keeps the ID.
  async rewrites() {
    return pages.flatMap(([name, id]) => [
      { source: `/${id}`, destination: `/${name}` },
      { source: `/${id}/:path*`, destination: `/${name}/:path*` },
    ]);
  },
};

export default nextConfig;
