import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * Chromium's fake camera plays this file; tests/e2e/global-setup.ts renders it to the same path before
 * the run. Kept as a path here rather than an import: Vercel type-checks this file during `next build`
 * and the tests folder is not uploaded.
 */
const FAKE_CAMERA_FILE = path.resolve(__dirname, ".data/e2e-camera.y4m");

/**
 * E2E + tap-count budget tests. Runs against a dev server backed by a
 * throwaway PGlite database so nothing touches real data.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    // iPhone viewport and touch, but driven by Chromium (WebKit is not installed).
    ...devices["iPhone 14"],
    browserName: "chromium",
    trace: "retain-on-failure",
    // A synthetic camera so the barcode scan runs end to end without hardware. The fake-ui flag is
    // required: without it Chromium's fake device rejects getUserMedia with NotSupportedError. The scan
    // test opts in with `test.use({ permissions: ["camera"] })`; the typed-code test stubs getUserMedia to deny.
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${FAKE_CAMERA_FILE}`],
    },
  },
  webServer: {
    // Fresh embedded database every run; the app migrates and seeds it on boot.
    command: "rm -rf .data/pglite-e2e && npm run dev -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PGLITE_DIR: ".data/pglite-e2e",
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret",
      SITE_PASSPHRASE: "e2e-passphrase",
      E2E: "1",
      NEXT_PUBLIC_APP_NAME: "Slate",
    },
  },
});
