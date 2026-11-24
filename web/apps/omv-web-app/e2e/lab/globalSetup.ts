// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's browser test runs against the lab's test-only build. Refuse to start without one.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSnippet } from "../support/snippetServer.ts";
import { LAB_DIST } from "./labDist.ts";

export default function globalSetup(): void {
  if (!existsSync(join(LAB_DIST, "index.html"))) {
    throw new Error(
      `No lab build in ${LAB_DIST}. Run \`pnpm build:lab\` in web/apps/omv-web-app first (\`pnpm test:browser:lab\` in web/ does both).`,
    );
  }
  readSnippet();
}
