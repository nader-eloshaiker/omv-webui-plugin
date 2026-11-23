// SPDX-License-Identifier: GPL-3.0-or-later
// The one place the network modules read the address this page was opened at (phase 5 network design
// 0.4). The pure modules take a PageLocation; this reads it from `window.location`.
//
// The mock's apparent address (D17): `pnpm dev:mock` and the tests run at localhost, which 0.4 reads
// as a tunnel, so the mock says where the page appears to be opened. Only the mock calls
// setApparentPageLocation (src/mocks/browser.ts, the test helpers), never from a URL or storage. Both
// uses sit behind `import.meta.env.DEV`, which a production build replaces with false: the branch, the
// variable and the setter's body are dropped, so production reads `window.location` and nothing else,
// and tools/build-check proves the setter's text is absent from the bundle (UI-11).
import type { PageLocation } from "./connection.ts";

let apparent: PageLocation | null = null;

/** Development and test builds only: the address the page appears to be opened at, or null for none. */
export function setApparentPageLocation(location: PageLocation | null): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (
    location !== null &&
    location.protocol !== "http:" &&
    location.protocol !== "https:"
  ) {
    throw new Error(
      "mock apparent page address: the protocol must be http: or https:",
    );
  }
  apparent = location === null ? null : { ...location };
}

export function readPageLocation(): PageLocation {
  if (import.meta.env.DEV && apparent !== null) {
    return { ...apparent };
  }
  const { protocol, hostname, port } = window.location;
  return { protocol, hostname, port };
}
