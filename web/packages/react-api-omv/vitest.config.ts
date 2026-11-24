import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // At most four test workers on a developer's computer and two on CI, so a test run leaves the
    // machine usable (owner, 2026-11-24). VITEST_MAX_WORKERS overrides it for one run.
    maxWorkers:
      Number(process.env.VITEST_MAX_WORKERS) || (process.env.CI ? 2 : 4),
    environment: "happy-dom",
    environmentOptions: { happyDOM: { url: "http://nas.example.org/ui/" } },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
