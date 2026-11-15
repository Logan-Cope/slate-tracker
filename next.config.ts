import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite is a WASM Postgres used for local dev/tests. Keep it out of the
  // server bundle so its wasm + data files load from node_modules directly.
  serverExternalPackages: ["@electric-sql/pglite"],
  // CLAUDE.md is the agent guide for this repo; skip Next's generated AGENTS.md.
  agentRules: false,
  async headers() {
    return [
      {
        // The service worker is served from /sw.js and must be allowed to
        // control the whole origin. No caching so updates land immediately.
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
