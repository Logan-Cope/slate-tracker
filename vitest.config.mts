import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // DB-backed tests spin up an in-memory PGlite; give them room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
