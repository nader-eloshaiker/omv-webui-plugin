// SPDX-License-Identifier: GPL-3.0-or-later
// The network stories for page tests (phase 5 network design 17). renderApp({ scenario }) with a network
// story boots the app on its remembering answers (src/mocks/networkScenarios.ts) and sets the address
// the page appears to be opened at (D17); these helpers reach what that story remembers, hold the page's
// writes to the contract, and move the page to another apparent address for one test.
import type { NetworkMockState } from "../mocks/networkScenarios.ts";
import type { MockSession } from "../mocks/scenarios.ts";
import type { PageLocation } from "../network/connection.ts";
import { setApparentPageLocation } from "../network/pageLocation.ts";

export {
  EXAMPLE_PASSWORD,
  NETWORK_DIRTY,
  NETWORK_IFACES,
  NETWORK_LOSS_MS,
  NEW_OBJECT,
} from "../mocks/networkScenarios.ts";

/** What a network story remembers (renderApp's `mock`); throws outside the network stories. */
export function networkStateOf(mock: MockSession): NetworkMockState {
  if (mock.network === undefined) {
    throw new Error(
      "Not a network story: renderApp({ scenario }) with one of NETWORK_SCENARIOS.",
    );
  }
  return mock.network;
}

/**
 * Hold every write of the page to the contract's request schema from now on: a body the contract
 * refuses answers 500 with "contract refused: …", so a test sees a malformed body fail.
 */
export function holdNetworkWritesToContract(
  mock: MockSession,
): NetworkMockState {
  const state = networkStateOf(mock);
  state.strict = true;
  return state;
}

/** For this test, the page appears to be opened at `location` (renderApp puts it back after each test). */
export function pageAt(location: PageLocation): void {
  setApparentPageLocation(location);
}
