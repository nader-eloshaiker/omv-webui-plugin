// SPDX-License-Identifier: GPL-3.0-or-later
// Storybook is the review surface for how a component looks. These tests pin what a story cannot: the
// behaviour a component adds on top of its primitive (focus on Cancel, the type-to-confirm gate, a
// secret never pre-filled) and that text from the backend renders as text.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // At most four test workers on a developer's computer and two on CI, so a test run leaves the
    // machine usable (owner, 2026-11-24). VITEST_MAX_WORKERS overrides it for one run.
    maxWorkers:
      Number(process.env.VITEST_MAX_WORKERS) || (process.env.CI ? 2 : 4),
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
