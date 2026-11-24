// SPDX-License-Identifier: GPL-3.0-or-later
// Where `pnpm build:lab` writes the lab's test-only build: beside dist/, never inside it.
import { fileURLToPath } from "node:url";

export const LAB_DIST = fileURLToPath(
  new URL("../../dist-lab/", import.meta.url),
);
