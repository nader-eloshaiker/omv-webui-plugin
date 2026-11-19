// SPDX-License-Identifier: GPL-3.0-or-later
// Shared Prettier config for the whole workspace; the workspace root re-exports it. Prettier's own
// defaults, as in the reference application. The one plugin sorts and prunes imports.
/** @type {import('prettier').Config} */
export default {
  plugins: ["prettier-plugin-organize-imports"],
};
