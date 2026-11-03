import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs a second dev server (no vocabulary) that needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  // Content is read with runtime paths, so tracing would pull in the whole root.
  // These must never ship (CLAUDE.md); scripts/check-trace.ts enforces it after build.
  outputFileTracingExcludes: {
    "*": [
      "corpus/**",
      "content/drafts/**",
      "content/_fixtures/**",
      "content/specs/**",
      "data/**",
      "e2e/**",
      "docs/**",
      "analysis/**",
      "scripts/**",
      ".superpowers/**",
      ".cache/**",
    ],
  },
  partialPrefetching: true,
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
