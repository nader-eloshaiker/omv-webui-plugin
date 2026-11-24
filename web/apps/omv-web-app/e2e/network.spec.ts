// SPDX-License-Identifier: GPL-3.0-or-later
// The network slice (phase 5 network design 18.1's keyboard pass), in the production build under the
// snippet's headers, on the remembering network mock (src/mocks/networkScenarios.ts). Every control
// is reached and worked from the keyboard: a key pressed on a focused control, text typed into a
// focused field; no click. The journeys: the NAS's name to the band and applied; this page's fixed
// address moved through the change flow with its typed confirmation, the wait and the moved card; the
// band's watch through a network restart, and its recovery card when the NAS does not come back; this
// page's port turned automatic, to the unknown-address recovery card; a second port set up; a bond, a
// VLAN and a bridge made; a bridge removed; a port's light blinked; firewall rules added, moved, Block
// everything else, one deleted, and the refusals; the proxy saved with a stored password typed again;
// Undo of a removal and 10.4's forced apply. Also the Interfaces page, the flow's summary and the
// recovery card at 320 px in both themes, and the firewall list with hostile values and with 200 rules.
//
// The production build reads where it was opened from `location` alone (src/network/pageLocation.ts),
// so each test opens the page at its story's address (`openedAt`: the browser reaches the test server
// as its HTTP proxy; nothing leaves the computer). A lost connection is no reply at all: the request is
// aborted. Every page loads without a page error, console error or CSP violation (support/fixtures.ts
// fails the test on any); the console errors a lost connection causes are allowed where a test causes
// one, with the reason. No real system is involved.
import type { Locator, Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import {
  EXAMPLE_PASSWORD,
  HOSTILE_SSID,
  networkPageAddress,
} from "../src/mocks/networkScenarios.ts";
import type { ScenarioName } from "../src/mocks/scenarios.ts";
import { expect, test } from "./support/fixtures.ts";
import type { ConsoleAllowance } from "./support/observer.ts";
import { answerWithScenario } from "./support/scenarioRoute.ts";
import { revealPendingBand } from "./support/shell.ts";

// Typed into the mock only.
const PASSWORD = "not-a-real-password";
const PROXY_PASSWORD = "typed-Proxy-pw9";

/** Where a story says the page is opened (D17). */
const openedAt = (scenario: ScenarioName): string => {
  const address = networkPageAddress(scenario);
  if (address === null) {
    throw new Error(`${scenario} is not a network story`);
  }
  return address.hostname;
};

// Every story used here but networkLayers opens the page at 192.0.2.10.
test.use({ openedAt: openedAt("networkTwo") });

const LONG = { timeout: 30_000 };

/** A lost connection: Chromium logs each aborted rpc.php request. */
const LOST_CONNECTION: ConsoleAllowance = {
  reason:
    "rpc.php gets no reply while the network restarts (the request is aborted)",
  matches: (message, origin) =>
    message.location().url === `${origin}/rpc.php` &&
    message.text().startsWith("Failed to load resource: net::ERR_"),
};

/** A sentence with names inside it, each optionally isolated (FSI and PDI) as the pages show them. */
const sentence = (text: string): RegExp =>
  new RegExp(
    `^${text
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{\\\{(\w+)\\\}\\\}/g, "\\u2068?.+?\\u2069?")
      .replace(/<(\w+)><\/\1>/g, "\\u2068?.+?\\u2069?")}$`,
  );

/** Every call but sign-in goes to the story; sign-in stays with the shared mock. */
const STORY_CALLS = (call: string): boolean => !call.startsWith("Session.");

async function signInWith(
  page: Page,
  rpc: { calls: string[] },
  scenario: ScenarioName,
): Promise<string[]> {
  expect(rpc.calls).toEqual([]);
  await page.goto("/ui/");
  // The page is opened where the story says it is.
  expect(new URL(page.url()).hostname).toBe(openedAt(scenario));
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByLabel(copy.signIn.password).press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
  return answerWithScenario(page, scenario, STORY_CALLS);
}

/**
 * The NAS stops answering at this page's address once an apply has started: every rpc.php request
 * after Config.applyChangesBg gets no reply, as when the page's address moved or the NAS took another.
 */
async function loseTheNasAfterApply(page: Page): Promise<void> {
  let lost = false;
  await page.route("**/rpc.php", async (route) => {
    if (lost) {
      await route.abort("connectionfailed");
      return;
    }
    const body = route.request().postDataJSON() as {
      service?: string;
      method?: string;
    } | null;
    if (body?.service === "Config" && body.method === "applyChangesBg") {
      lost = true;
    }
    await route.fallback();
  });
}

// ---- The keyboard ---------------------------------------------------------------------------------

/** A control that can be used now: a page's controls wait for its reads. */
const usable = (control: Locator) =>
  expect(control).not.toHaveAttribute("aria-disabled", "true", LONG);
/** A button or link, from the keyboard. */
async function press(control: Locator) {
  await usable(control);
  await control.press("Enter");
}
/** A radio button or checkbox, from the keyboard. */
async function tick(control: Locator) {
  await usable(control);
  await control.press("Space");
}
/** Text typed into a field: it is focused, emptied and typed into. */
async function type(field: Locator, text: string) {
  await field.focus();
  await field.press("ControlOrMeta+a");
  await field.press("Backspace");
  await field.pressSequentially(text);
}
/** An option of a list box (a select), opened from the keyboard. */
async function choose(page: Page, select: Locator, option: RegExp | string) {
  await usable(select);
  await select.press("Enter");
  await page.getByRole("option", { name: option }).press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Apply everything pending from the band, through its confirmation, and wait for the band to go. */
async function applyFromBand(page: Page) {
  const band = page.getByRole("region", { name: copy.pending.label });
  await revealPendingBand(page);
  const apply = band.getByRole("button", { name: /^Apply \d+ changes?$/ });
  await expect(apply).toBeVisible(LONG);
  const label = ((await apply.textContent()) ?? "").trim();
  await press(apply);
  const dialog = page.getByRole("alertdialog", { name: `${label}?` });
  await expect(dialog.getByText(copy.netApply.checking)).toHaveCount(0, LONG);
  await press(dialog.getByRole("button", { name: label }));
  await expect(band).toHaveCount(0, LONG);
}

/** No horizontal scrolling: the page fits its width. */
async function expectNoSideways(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

/** The system theme (the default) follows the browser's colour scheme, through CSS alone. */
async function inBothThemes(page: Page, check: () => Promise<void>) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-color-scheme: dark)").matches,
      ),
    ).toBe(colorScheme === "dark");
    await check();
  }
}

// ---- The name ---------------------------------------------------------------------------------------

test("changes the NAS's name to the band and applies it", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "networkOne");
  await page.goto("/ui/network/general");
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toHaveValue("nas", LONG);
  await type(name, "nas-two");
  // Opened at an address: the name does not move this page, so it goes to the band.
  const save = page.getByRole("button", { name: "Save", exact: true });
  await press(save);
  await expect(
    page
      .getByText(
        "The new name is saved. It takes effect when you apply the changes.",
      )
      .first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Network.setGeneralSettings");
  expect(calls).not.toContain("Config.applyChangesBg");
  await applyFromBand(page);
  expect(calls).toContain("Config.applyChangesBg");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("nas-two", LONG);
});

// ---- This page's own port -------------------------------------------------------------------------

test.describe("this page's own port", () => {
  test.use({ extraAllowances: { list: [LOST_CONNECTION] } });

  test("moves this page's fixed address through the flow: typed confirmation, the wait, the moved card", async ({
    page,
    rpc,
  }) => {
    test.setTimeout(120_000);
    const calls = await signInWith(page, rpc, "networkTwo");
    await page.goto("/ui/network/interfaces/enp2s0");
    await press(
      page
        .getByRole("region", { name: "Settings", exact: true })
        .getByRole("button", { name: "Change settings" }),
    );
    const v4 = page.getByRole("group", { name: "IPv4" });
    const address = v4.getByRole("textbox", { name: "Address", exact: true });
    await expect(address).toHaveValue("192.0.2.10", LONG);
    await type(address, "192.0.2.20");
    // With a router address the NAS needs a name server (5.3); the story's port has none yet.
    await type(
      page.getByRole("textbox", { name: "Name servers" }),
      "192.0.2.1",
    );
    await press(page.getByRole("button", { name: copy.netChange.review }));

    // The summary: Cancel first, Save and apply only once the new address is typed.
    await expect(
      page.getByRole("heading", { name: /^Review the change to/ }),
    ).toBeVisible(LONG);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(
      page.getByRole("table", { name: copy.netChange.tableName }),
    ).toBeVisible();
    const confirm = page.getByRole("button", {
      name: copy.netChange.confirm,
    });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    const typed = page.getByRole("textbox", {
      name: "Type the new address to confirm it: 192.0.2.20",
    });
    await type(typed, "192.0.2.20");
    expect(calls).not.toContain("Network.setEthernetIface");
    await loseTheNasAfterApply(page);
    await press(confirm);

    // The NAS no longer answers at the old address: the wait, then the moved card.
    await expect(
      page.getByRole("button", { name: copy.netChange.stopWaiting }),
    ).toBeVisible(LONG);
    await expect(
      page.getByText(/^Waiting for the NAS to answer…/).first(),
    ).toBeVisible();
    await expect(page.getByText(/^The NAS is now at/)).toHaveText(
      sentence("The NAS is now at http://192.0.2.20/ui/."),
      { timeout: 60_000 },
    );
    // Typed in this session, so a link (P7).
    await expect(
      page
        .getByRole("link", { name: /Open the NAS at its new address/ })
        .first(),
    ).toHaveAttribute("href", "http://192.0.2.20/ui/");
    expect(calls).toContain("Network.setEthernetIface");
    expect(calls).toContain("Config.applyChangesBg");
  });

  test("turns this page's port to automatic and reaches the unknown-address recovery card", async ({
    page,
    rpc,
  }) => {
    test.setTimeout(90_000);
    await signInWith(page, rpc, "networkTwo");
    await page.goto("/ui/network/interfaces/enp2s0");
    await press(
      page
        .getByRole("region", { name: "Settings", exact: true })
        .getByRole("button", { name: "Change settings" }),
    );
    const v4 = page.getByRole("group", { name: "IPv4" });
    await tick(
      v4.getByRole("radio", { name: /^Automatically from the router/ }),
    );
    await press(page.getByRole("button", { name: copy.netChange.review }));
    await expect(
      page.getByRole("heading", { name: /^Review the change to/ }),
    ).toBeVisible(LONG);
    await expect(page.getByText(copy.netChange.effect.automatic)).toBeVisible();
    await type(
      page.getByRole("textbox", {
        name: "Type the interface's name to confirm: enp2s0",
      }),
      "enp2s0",
    );
    await loseTheNasAfterApply(page);
    await press(page.getByRole("button", { name: copy.netChange.confirm }));
    const stop = page.getByRole("button", { name: copy.netChange.stopWaiting });
    await expect(stop).toBeVisible(LONG);
    await press(stop);
    const card = page.getByRole("region", {
      name: copy.netRecover.unknownAddress,
    });
    await expect(card).toBeVisible();
    // The .local address is offered as text only: it did not come from this session's typing (P7).
    await expect(card).toContainText("http://nas.local/ui/");
    await expect(card.getByRole("link")).toHaveCount(0);
    await expect(card.getByText("omv-firstaid")).toBeVisible();
  });
});

// ---- The band's watch -------------------------------------------------------------------------------

test.describe("the band's watch", () => {
  test.use({ extraAllowances: { list: [LOST_CONNECTION] } });

  test("waits through a network restart, then says the NAS is reached again", async ({
    page,
    rpc,
  }) => {
    test.setTimeout(90_000);
    await signInWith(page, rpc, "networkApply");
    await page.goto("/ui/network/interfaces");
    const band = page.getByRole("region", { name: copy.pending.label });
    await revealPendingBand(page);
    const apply = band.getByRole("button", { name: /^Apply \d+ changes?$/ });
    await expect(apply).toBeVisible(LONG);
    const label = ((await apply.textContent()) ?? "").trim();
    await press(apply);
    const dialog = page.getByRole("alertdialog", { name: `${label}?` });
    await expect(dialog.getByText(copy.netApply.checking)).toHaveCount(0, LONG);
    await press(dialog.getByRole("button", { name: label }));
    await expect(
      page.getByRole("button", { name: copy.netChange.stopWaiting }),
    ).toBeVisible(LONG);
    await expect(page.getByText(copy.netApply.connectedAgain)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/Applying the changes failed/)).toHaveCount(0);
  });

  test("shows the recovery card when the NAS does not come back", async ({
    page,
    rpc,
  }) => {
    test.setTimeout(90_000);
    await signInWith(page, rpc, "networkApplyNever");
    await page.goto("/ui/network/interfaces");
    const band = page.getByRole("region", { name: copy.pending.label });
    await revealPendingBand(page);
    const apply = band.getByRole("button", { name: /^Apply \d+ changes?$/ });
    await expect(apply).toBeVisible(LONG);
    const label = ((await apply.textContent()) ?? "").trim();
    await press(apply);
    const dialog = page.getByRole("alertdialog", { name: `${label}?` });
    await expect(dialog.getByText(copy.netApply.checking)).toHaveCount(0, LONG);
    await press(dialog.getByRole("button", { name: label }));
    const stop = page.getByRole("button", { name: copy.netChange.stopWaiting });
    await expect(stop).toBeVisible(LONG);
    await expect(
      page.getByText(/^Waiting for the NAS to answer…/).first(),
    ).toBeVisible();
    await press(stop);
    const card = page.getByRole("region", { name: copy.netRecover.lost });
    await expect(card).toBeVisible();
    await expect(card.getByText("omv-firstaid")).toBeVisible();
    await expect(card.getByRole("link")).toHaveCount(0);
  });
});

// ---- Interfaces ------------------------------------------------------------------------------------

test("sets up a second port to the band, and the list focuses its row", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "networkTwo");
  await page.goto("/ui/network/interfaces");
  await expect(
    page.getByRole("table").getByRole("link", { name: "enp3s0" }),
  ).toBeVisible(LONG);
  await press(page.getByRole("button", { name: copy.interfaces.add.label }));
  await press(page.getByRole("menuitem", { name: copy.interfaces.add.port }));
  await expect(
    page.getByRole("heading", { level: 1, name: copy.ifaceForm.titleNew }),
  ).toBeVisible(LONG);
  await choose(page, page.getByRole("combobox", { name: "Port" }), /^enp3s0/);
  await expect(page.getByText("This page keeps working.")).toBeVisible();
  await press(page.getByRole("button", { name: "Save", exact: true }));
  await expect(
    page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
  ).toBeVisible(LONG);
  await expect(
    page
      .getByText(
        sentence(copy.ifaceForm.saved.replace("{{iface}}", "<iface></iface>")),
      )
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByRole("link", { name: "enp3s0" }),
  ).toBeFocused(LONG);
  expect(calls).toContain("Network.setEthernetIface");
  await expect(
    page.getByRole("region", { name: copy.pending.label }),
  ).toBeVisible();
});

test("makes a bond of a free port, to the band", async ({ page, rpc }) => {
  const calls = await signInWith(page, rpc, "networkTwo");
  await page.goto("/ui/network/interfaces/add/bond");
  const ports = page.getByRole("group", { name: "Ports in the bond" });
  await expect(
    ports.getByRole("checkbox", { name: /^enp2s0/ }),
  ).toHaveAttribute("aria-disabled", "true", LONG);
  await tick(ports.getByRole("checkbox", { name: /^enp3s0/ }));
  await tick(
    page.getByRole("radio", { name: /^Keep working if a port fails/ }),
  );
  await choose(
    page,
    page.getByRole("combobox", { name: "Main port" }),
    /^enp3s0$/,
  );
  await press(page.getByRole("button", { name: "Save", exact: true }));
  await expect(
    page
      .getByText(
        "The bond is saved. It takes effect when you apply the changes.",
      )
      .first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Network.setBondIface");
  // A bond is a device only once applied: its row appears then.
  await applyFromBand(page);
  await expect(
    page.getByRole("table").getByRole("link", { name: "bond0" }).first(),
  ).toBeVisible(LONG);
});

test("adds a VLAN on this page's port, a brief interruption, to the band", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "networkOne");
  await page.goto("/ui/network/interfaces/add/vlan");
  await choose(
    page,
    page.getByRole("combobox", { name: "Runs on" }),
    /^enp2s0/,
  );
  await type(page.getByRole("textbox", { name: "VLAN ID" }), "10");
  await expect(page.getByText(/^The NAS names it/)).toHaveText(
    sentence("The NAS names it enp2s0.10."),
  );
  await tick(
    page
      .getByRole("group", { name: "IPv4" })
      .getByRole("radio", { name: /^Automatically from the router/ }),
  );
  await expect(
    page.getByText(
      "This page may stop responding for a few seconds while the network restarts, then carries on.",
    ),
  ).toBeVisible();
  await press(page.getByRole("button", { name: "Save", exact: true }));
  await expect(
    page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
  ).toBeVisible(LONG);
  expect(calls).toContain("Network.setVlanIface");
  await applyFromBand(page);
  await expect(
    page.getByRole("table").getByRole("link", { name: "enp2s0.10" }).first(),
  ).toBeVisible(LONG);
});

test("makes a bridge with a free port, to the band", async ({ page, rpc }) => {
  const calls = await signInWith(page, rpc, "networkTwo");
  await page.goto("/ui/network/interfaces/add/bridge");
  const members = page.getByRole("group", {
    name: /^Interfaces in the bridge/,
  });
  await expect(
    members.getByRole("checkbox", { name: /^enp2s0/ }),
  ).toHaveAttribute("aria-disabled", "true", LONG);
  await tick(members.getByRole("checkbox", { name: /^enp3s0/ }));
  await press(page.getByRole("button", { name: "Save", exact: true }));
  await expect(
    page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
  ).toBeVisible(LONG);
  expect(calls).toContain("Network.setBridgeIface");
  await applyFromBand(page);
  await expect(
    page.getByRole("table").getByRole("link", { name: "br0" }).first(),
  ).toBeVisible(LONG);
});

test.describe("on the story with layers", () => {
  // networkLayers opens the page at the VLAN's address.
  test.use({ openedAt: openedAt("networkLayers") });

  test("removes a bridge's settings through the destructive confirmation", async ({
    page,
    rpc,
  }) => {
    const calls = await signInWith(page, rpc, "networkLayers");
    await page.goto("/ui/network/interfaces/br0");
    const section = page.getByRole("region", {
      name: copy.ifaceDelete.section,
    });
    await press(section.getByRole("button", { name: copy.ifaceDelete.open }));
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading")).toHaveText(
      sentence("Remove the settings of <iface></iface>?"),
    );
    await expect(dialog).toContainText("Its interfaces");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    expect(calls).not.toContain("Network.deleteInterface");
    await press(
      dialog.getByRole("button", {
        name: copy.ifaceDelete.confirm,
        exact: true,
      }),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: copy.interfaces.title }),
    ).toBeFocused(LONG);
    expect(calls).toContain("Network.deleteInterface");
    await expect(
      page.getByRole("table").getByRole("link", { name: "br0" }),
    ).toBeVisible();
    await applyFromBand(page);
    await expect(
      page.getByRole("table").getByRole("link", { name: "br0" }),
    ).toHaveCount(0, LONG);
  });
});

test("blinks a port's light for 5 seconds", async ({ page, rpc }) => {
  const calls = await signInWith(page, rpc, "networkTwo");
  await page.goto("/ui/network/interfaces/enp3s0");
  await press(page.getByRole("button", { name: "Blink its light…" }));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText(
    sentence("Blink the light of <iface></iface>"),
  );
  await tick(dialog.getByRole("radio", { name: "5 seconds", exact: true }));
  await press(dialog.getByRole("button", { name: "Blink", exact: true }));
  await expect(dialog.getByText(/^Blinking for/)).toBeVisible(LONG);
  await expect(dialog.getByText("Done. Did you see the light?")).toBeVisible(
    LONG,
  );
  expect(calls).toContain("Network.identify");
  await press(dialog.getByRole("button", { name: "Close" }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The task's handle is never in the page (UI-5).
  expect(await page.content()).not.toContain("/tmp/bgstatus");
});

// ---- Firewall ----------------------------------------------------------------------------------------

const ADD_RULE = { name: copy.fwRule.titleNew };

test("adds firewall rules, moves one, blocks everything else and deletes one", async ({
  page,
  rpc,
}) => {
  test.setTimeout(90_000);
  const calls = await signInWith(page, rpc, "firewallNone");
  await page.goto("/ui/network/firewall");
  await expect(
    page.getByRole("heading", { level: 1, name: copy.firewall.title }),
  ).toBeVisible(LONG);

  // Allow SSH, at the end.
  await press(page.getByRole("button", { name: copy.firewall.add }).first());
  let dialog = page.getByRole("dialog", ADD_RULE);
  await tick(dialog.getByRole("radio", { name: "Allow" }));
  await choose(page, dialog.getByRole("combobox", { name: "Port" }), /^22 /);
  await press(dialog.getByRole("button", { name: copy.fwRule.add }));
  await expect(page.getByText(copy.fwRule.saved).first()).toBeVisible(LONG);

  // Block everything else is refused while nothing lets this page in; Allow this page fills the rule.
  await press(page.getByRole("button", { name: copy.firewall.blockRest }));
  let block = page.getByRole("alertdialog", {
    name: "Block everything else coming in",
  });
  await expect(
    block.getByText(
      "Nothing above allows this page, so it would be blocked. Allow it first.",
    ),
  ).toBeVisible(LONG);
  await press(block.getByRole("button", { name: /^Allow this page for/ }));
  dialog = page.getByRole("dialog", ADD_RULE);
  await expect(dialog.getByRole("radio", { name: "Allow" })).toBeChecked(LONG);
  await expect(dialog.getByRole("combobox", { name: "Where" })).toHaveText(
    "At the top",
  );
  await press(dialog.getByRole("button", { name: copy.fwRule.add }));
  await expect(page.getByRole("dialog", ADD_RULE)).toHaveCount(0, LONG);

  // Move the SSH rule to the top with its button; focus stays on the moved rule.
  const table = page.getByRole("table", { name: copy.firewall.title });
  await expect(table.getByRole("row")).toHaveCount(3, LONG);
  await press(page.getByRole("button", { name: "Move rule 2 up" }));
  await expect(page.getByText("Rule moved to position 1.")).toBeAttached();
  await expect(
    page.getByRole("button", { name: "Move rule 1 up" }),
  ).toBeFocused();
  await press(page.getByRole("button", { name: "Save the new order" }));
  await expect(
    page
      .getByText(
        "The new order is saved. It takes effect when you apply the changes.",
      )
      .first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Iptables.setRules");

  // Delete the SSH rule, now rule 1: nothing blocks this page without it, so it goes to the band.
  await press(page.getByRole("button", { name: "Delete rule 1" }));
  const remove = page.getByRole("alertdialog", { name: "Delete rule 1?" });
  await expect(remove.getByRole("button", { name: "Cancel" })).toBeFocused(
    LONG,
  );
  await press(remove.getByRole("button", { name: "Delete rule", exact: true }));
  await expect(
    page
      .getByText(
        "Rule 1 is deleted. This takes effect when you apply the changes.",
      )
      .first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Iptables.deleteRule");
  await expect(table.getByRole("row")).toHaveCount(2, LONG);
  await applyFromBand(page);

  // Block everything else, now that a rule lets this page in.
  await press(page.getByRole("button", { name: copy.firewall.blockRest }));
  block = page.getByRole("alertdialog", {
    name: "Block everything else coming in",
  });
  await expect(block).toBeVisible(LONG);
  const add = block.getByRole("button", { name: "Add the three rules" });
  const review = block.getByRole("button", { name: copy.netChange.review });
  // The rules would let only computers on this page's network in: the review, with firewall typed.
  await expect(add).toHaveCount(0);
  await press(review);
  await expect(
    page.getByRole("heading", {
      name: "Review the change to the firewall rules",
    }),
  ).toBeVisible(LONG);
  await type(
    page.getByRole("textbox", { name: copy.netChange.typeFirewall }),
    "firewall",
  );
  await press(page.getByRole("button", { name: copy.netChange.confirm }));
  await press(page.getByRole("button", { name: copy.netChange.keep }));
  expect(calls.filter((c) => c === "Config.applyChangesBg")).toHaveLength(2);
  await expect(table.getByRole("row")).toHaveCount(5, LONG);
});

test("refuses to delete the rule that lets this page in above Block everything else", async ({
  page,
  rpc,
}) => {
  await signInWith(page, rpc, "firewallAllowlist");
  await page.goto("/ui/network/firewall");
  await press(page.getByRole("button", { name: "Delete rule 1" }));
  const dialog = page.getByRole("alertdialog", { name: "Delete rule 1?" });
  await expect(dialog).toContainText(copy.firewall.pageRefused, LONG);
  await expect(
    dialog.getByRole("button", { name: "Delete rule", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await dialog.press("Escape");
});

test("refuses to apply pending firewall rules that block this page for everyone", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "firewallBlocksPage");
  await page.goto("/ui/network/firewall");
  const band = page.getByRole("region", { name: copy.pending.label });
  await revealPendingBand(page);
  const apply = band.getByRole("button", { name: /^Apply \d+ changes?$/ });
  await expect(apply).toBeVisible(LONG);
  const label = ((await apply.textContent()) ?? "").trim();
  await press(apply);
  const dialog = page.getByRole("alertdialog", { name: `${label}?` });
  await expect(dialog).toContainText(copy.netApply.refusedFirewall, LONG);
  await expect(dialog.getByRole("button", { name: label })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    dialog.getByRole("link", { name: copy.netApply.changeRules }),
  ).toBeVisible();
  expect(calls).not.toContain("Config.applyChangesBg");
});

// ---- Proxy --------------------------------------------------------------------------------------------

test("saves the proxy with a stored password typed again and one removed, and shows neither", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "proxySet");
  await page.goto("/ui/network/proxy");
  const http = page.locator("[data-proxy]").filter({
    has: page.getByRole("heading", { name: copy.proxy.http }),
  });
  const https = page.locator("[data-proxy]").filter({
    has: page.getByRole("heading", { name: copy.proxy.https }),
  });
  await expect(http.getByText(copy.proxy.passwordSet)).toBeVisible(LONG);
  await type(http.getByRole("textbox", { name: "Port" }), "3130");
  const save = page.getByRole("button", { name: copy.proxy.save, exact: true });
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await tick(http.getByRole("radio", { name: copy.proxy.keep }));
  const password = http.locator('input[type="password"]');
  await expect(password).toHaveValue("");
  await type(password, PROXY_PASSWORD);
  await tick(https.getByRole("radio", { name: copy.proxy.remove }));
  await press(save);
  await expect(page.getByText(copy.proxy.saved).first()).toBeVisible(LONG);
  expect(calls).toContain("Network.setProxy");
  // The form is as read again: the stored password needs its answer again, and neither the typed
  // password nor the stored one is anywhere in the page (UI-6).
  await expect(
    http.getByRole("radio", { name: copy.proxy.keep }),
  ).not.toBeChecked(LONG);
  const html = await page.content();
  expect(html).not.toContain(PROXY_PASSWORD);
  expect(html).not.toContain(EXAMPLE_PASSWORD);
});

// ---- Undo a removal (10.4) ---------------------------------------------------------------------------

test("undoes a removal from the band, then applies the queued jobs and the network", async ({
  page,
  rpc,
}) => {
  const calls = await signInWith(page, rpc, "networkPending");
  await page.goto("/ui/network/interfaces");
  const band = page.getByRole("region", { name: copy.pending.label });
  await revealPendingBand(page);
  const undo = band.getByRole("button", { name: /^Undo \d+ changes?$/ });
  await expect(undo).toBeVisible(LONG);
  const label = ((await undo.textContent()) ?? "").trim();
  await press(undo);
  const dialog = page.getByRole("alertdialog", { name: `${label}?` });
  await press(dialog.getByRole("button", { name: label }));
  await expect(
    page.getByText(/are back\. The NAS still has a job/).first(),
  ).toBeVisible(LONG);
  expect(calls).toContain("Config.revertChangesBg");
  expect(calls).not.toContain("Config.applyChangesBg");
  await press(page.getByRole("button", { name: copy.netApply.applyQueued }));
  await expect
    .poll(() => calls.includes("Config.applyChangesBg"), LONG)
    .toBe(true);
  await expect(
    page.getByRole("table").getByRole("link", { name: "enp26s0" }),
  ).toBeVisible(LONG);
});

// ---- Layout -------------------------------------------------------------------------------------------

test.describe("at 320 px", () => {
  test.use({
    viewport: { width: 320, height: 720 },
    extraAllowances: { list: [LOST_CONNECTION] },
  });

  test("the Interfaces page, the flow's summary and the recovery card fit, in both themes", async ({
    page,
    rpc,
  }, testInfo) => {
    test.setTimeout(90_000);
    await signInWith(page, rpc, "networkTwo");
    await page.goto("/ui/network/interfaces");
    await expect(
      page.getByRole("table").getByRole("link", { name: "enp2s0" }),
    ).toBeVisible(LONG);
    await inBothThemes(page, async () => {
      await expectNoSideways(page);
      await page.screenshot({
        path: testInfo.outputPath(`interfaces-${String(Date.now())}.png`),
        fullPage: true,
      });
    });

    await page.goto("/ui/network/interfaces/enp2s0");
    await press(
      page
        .getByRole("region", { name: "Settings", exact: true })
        .getByRole("button", { name: "Change settings" }),
    );
    await tick(
      page
        .getByRole("group", { name: "IPv4" })
        .getByRole("radio", { name: /^Automatically from the router/ }),
    );
    await press(page.getByRole("button", { name: copy.netChange.review }));
    await expect(
      page.getByRole("heading", { name: /^Review the change to/ }),
    ).toBeVisible(LONG);
    await inBothThemes(page, async () => {
      await expectNoSideways(page);
      await page.screenshot({
        path: testInfo.outputPath(`summary-${String(Date.now())}.png`),
        fullPage: true,
      });
    });

    await type(
      page.getByRole("textbox", {
        name: "Type the interface's name to confirm: enp2s0",
      }),
      "enp2s0",
    );
    await loseTheNasAfterApply(page);
    await press(page.getByRole("button", { name: copy.netChange.confirm }));
    await press(page.getByRole("button", { name: copy.netChange.stopWaiting }));
    await expect(
      page.getByRole("region", { name: copy.netRecover.unknownAddress }),
    ).toBeVisible(LONG);
    await inBothThemes(page, async () => {
      await expectNoSideways(page);
      await page.screenshot({
        path: testInfo.outputPath(`recovery-${String(Date.now())}.png`),
        fullPage: true,
      });
    });
  });

  test("the firewall list and a Wi-Fi interface with hostile values fit, as inert text", async ({
    page,
    rpc,
  }) => {
    await signInWith(page, rpc, "networkHostile");
    await page.goto("/ui/network/firewall");
    const table = page.getByRole("table", { name: copy.firewall.title });
    await expect(table.getByRole("row")).toHaveCount(2, LONG);
    await expect(table).toContainText('<img src=x onerror="alert(1)">');
    expect(await page.locator("main img, main script").count()).toBe(0);
    await expectNoSideways(page);
    // A Wi-Fi network name with markup and a direction override stays text, and its stored password
    // is nowhere in the page.
    await page.goto("/ui/network/interfaces/wlx00005e005302");
    const settings = page.getByRole("region", {
      name: "Settings",
      exact: true,
    });
    // The override is shown as "\uFFFD" (src/format/isolate.ts), so the letters keep their stored order.
    await expect(settings).toContainText(
      HOSTILE_SSID.replace("\u202E", "\uFFFD"),
      LONG,
    );
    expect(await settings.innerText()).not.toContain("\u202E");
    expect(await page.locator("main i, main img, main script").count()).toBe(0);
    expect(await page.content()).not.toContain(EXAMPLE_PASSWORD);
    await expectNoSideways(page);
  });

  test("the firewall list with 200 rules fits", async ({ page, rpc }) => {
    await signInWith(page, rpc, "firewallMany");
    await page.goto("/ui/network/firewall");
    const table = page.getByRole("table", { name: copy.firewall.title });
    await expect(table.getByRole("row")).toHaveCount(201, LONG);
    await inBothThemes(page, () => expectNoSideways(page));
  });
});
