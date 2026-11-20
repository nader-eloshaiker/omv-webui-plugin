// SPDX-License-Identifier: GPL-3.0-or-later
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in `pnpm dev:mock` (.env.mock). Read only behind import.meta.env.DEV. */
  readonly VITE_MOCK_API?: string;
}
