// SPDX-License-Identifier: GPL-3.0-or-later
// Shared ESLint flat-config preset for the whole workspace, re-exported by web/eslint.config.js.
// Mirrors the reference application's preset, plus the UI-* rules of docs/05-security.md
// (eslint.security.js). Generated output is ignored.
import eslintReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";
import {
  MOCK_FILES,
  STORE_FILES,
  TRANSPORT_FILES,
  securityRules,
} from "./eslint.security.js";

// The preset lives two levels below the workspace root it lints; anchor typescript-eslint there.
const tsconfigRootDir = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

export default defineConfig([
  globalIgnores([
    "**/dist",
    "**/node_modules",
    "**/generated/**",
    "**/storybook-static/**",
    "**/routeTree.gen.ts",
    "**/*.gen.ts",
    "**/coverage/**",
  ]),
  {
    // UI-2 and docs/08: a UI-* rule cannot be switched off by a comment in the file. An exemption is
    // a block in this preset, which review sees, with the owner's approval recorded in the journal.
    linterOptions: {
      noInlineConfig: true,
      reportUnusedInlineConfigs: "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic,
      eslintReact.configs["recommended-typescript"],
      reactRefresh.configs.vite,
      prettierConfig,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { tsconfigRootDir },
    },
    plugins: { prettier: prettierPlugin },
    rules: {
      "prettier/prettier": "error",
      curly: ["error", "all"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      ...securityRules(),
    },
  },
  {
    files: TRANSPORT_FILES,
    rules: securityRules({ network: true }),
  },
  {
    files: STORE_FILES,
    rules: securityRules({ storage: true }),
  },
  {
    files: MOCK_FILES,
    rules: {
      ...securityRules({ mocks: true }),
      // In a test a missing value fails the test, so a non-null assertion claims nothing extra.
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Node scripts and configuration: plain JavaScript run by node, not shipped to the browser.
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: { globals: globals.node },
    plugins: { prettier: prettierPlugin },
    rules: {
      "prettier/prettier": "error",
      curly: ["error", "all"],
    },
  },
]);
