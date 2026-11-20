// SPDX-License-Identifier: GPL-3.0-or-later
// Storybook is the review surface for how a component looks. These tests pin what a story cannot: the
// behaviour a component adds on top of its primitive (focus on Cancel, the type-to-confirm gate, a
// secret never pre-filled) and that text from the backend renders as text.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
