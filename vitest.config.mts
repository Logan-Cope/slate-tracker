import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // DB-backed tests spin up an in-memory PGlite; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
