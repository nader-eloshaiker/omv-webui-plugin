// SPDX-License-Identifier: GPL-3.0-or-later
// The browser test runs against the production build. Refuse to start without one, rather than
// letting every test fail on a page that does not load.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DIST, readSnippet } from "./snippetServer.ts";

export default function globalSetup(): void {
  if (!existsSync(join(DIST, "index.html"))) {
    throw new Error(
      `No production build in ${DIST}. Run \`pnpm build\` in web/ first (\`pnpm test:browser\` there does both).`,
    );
  }
  // Fail once, here, if the snippet cannot be read, instead of in every worker.
  readSnippet();
}
