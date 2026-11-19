// SPDX-License-Identifier: GPL-3.0-or-later
// The one build-time value the transport reads. Vite (and Vitest) replace it statically.
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
