// SPDX-License-Identifier: GPL-3.0-or-later
// The accessibility test runs against the library's built Storybook. Refuse to start without one.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STORYBOOK_STATIC } from "./storybookStatic.ts";

export default function globalSetup(): void {
  if (!existsSync(join(STORYBOOK_STATIC, "index.json"))) {
    throw new Error(
      `No Storybook build in ${STORYBOOK_STATIC}. Run \`pnpm build-storybook\` in web/packages/react-ui-components first (\`pnpm test:browser:stories\` in web/ does both).`,
    );
  }
}
