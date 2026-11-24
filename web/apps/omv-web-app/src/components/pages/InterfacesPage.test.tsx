// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Interfaces (phase 5 network design 3) through the whole app on MSW, with the network
// mock's stories: the connection line, the attention lines worst first (the unmanaged port as a plain
// line, VM fact 18.2 #7), "Set up…" with its reasons, the table with members under their bond or
// bridge, "This page uses it", "Part of", "Runs on", how and the address of each family, the pending
// mark, virtual interfaces counted; the states of 3.3; hostile values as inert text; a normal user.
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import {
  requestRowFocus,
  rowFocusRequest,
} from "../../network/newIfaceFocus.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, server } from "../../test/server.ts";

async function page(scenario: ScenarioName, answers = {}) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: "/network/interfaces",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Network interfaces" });
  return view;
}

const table = () => screen.findByRole("table", undefined, { timeout: 3000 });
const row = (name: string) => {
  const link = within(screen.getByRole("table")).getAllByRole("link", {
    name,
  })[0];
  const tr = link?.closest("tr") ?? null;
  if (tr === null) {
    throw new Error(`no row for ${name}`);
  }
  return tr;
};

describe("3.2: the populated page", () => {
  it("says which interface this page uses, and lists each one with its connection and addresses", async () => {
    await page("networkOne");
    await table();
    expect(
      screen.getByText(/^This page reaches the NAS at/u),
    ).toHaveTextContent(
      "This page reaches the NAS at 192.0.2.10 through enp2s0.",
    );
    const enp2s0 = row("enp2s0");
    expect(enp2s0).toHaveTextContent("Network port");
    expect(enp2s0).toHaveTextContent("This page uses it");
    expect(enp2s0).toHaveTextContent("Connected at 1 Gbit/s");
    expect(enp2s0).toHaveTextContent("Automatic (DHCP)192.0.2.10/24");
    expect(enp2s0).toHaveTextContent("Automatic2001:db8::10/64");
    expect(
      within(enp2s0).getByRole("link", { name: "enp2s0" }),
    ).toHaveAttribute("href", "/ui/network/interfaces/enp2s0");
    // Loopback is left out; nothing is a status pill (D8).
    expect(screen.queryByRole("link", { name: "lo" })).toBeNull();
    expect(enp2s0.querySelector("[data-slot=status-pill]")).toBeNull();
    expect(
      screen.getByRole("link", {
        name: /^Network interfaces in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/network/interfaces");
    expect(
      screen.getByText("Traffic charts are in the classic interface."),
    ).toBeVisible();
  });

  it("shows a port with no settings as not set up here, with no address", async () => {
    await page("networkTwo");
    await table();
    const enp3s0 = row("enp3s0");
    expect(enp3s0).toHaveTextContent("Not connected");
    expect(enp3s0).toHaveTextContent("Not set up hereNo address");
    expect(row("enp2s0")).toHaveTextContent("Fixed address192.0.2.10/24");
  });

  it("lists members under their bond or bridge, with Part of and Runs on", async () => {
    await page("networkLayers");
    const frame = await table();
    const order = within(frame)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("link")[0]?.textContent ?? "");
    // Each member sits right under its parent, one level in.
    const bond = order.indexOf("bond0");
    expect(order.slice(bond + 1, bond + 3).sort()).toEqual([
      "enp26s0",
      "enp3s0",
    ]);
    const bridge = order.indexOf("br0");
    expect(order[bridge + 1]).toBe("enp4s0");
    expect(order.filter((n) => n === "enp3s0")).toHaveLength(1);
    expect(row("enp3s0")).toHaveAttribute("data-depth", "1");
    expect(row("bond0")).toHaveAttribute("data-depth", "0");
    expect(row("enp3s0")).toHaveTextContent("Part of bond0");
    expect(row("enp4s0")).toHaveTextContent("Part of br0");
    expect(row("bond0.10")).toHaveTextContent("Runs on bond0");
    expect(row("bond0.10")).toHaveTextContent("This page uses it");
    expect(row("bond0")).not.toHaveTextContent("This page uses it");
  });

  it("counts virtual interfaces under the table instead of listing them", async () => {
    await page("networkVpn");
    await table();
    expect(
      screen.getByText(
        "Also 1 virtual interface, used by containers or VPNs, not shown.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "wg0" })).toBeNull();
  });

  it("marks settings not applied yet, and leads with them in the attention lines", async () => {
    await page("networkPending");
    await table();
    expect(row("enp3s0")).toHaveTextContent("Not applied yet");
    const line = screen.getByText(/has settings that are not applied yet/u);
    expect(line).toHaveTextContent(
      "enp3s0 has settings that are not applied yet.",
    );
    expect(within(line).getByRole("link", { name: "enp3s0" })).toHaveAttribute(
      "href",
      "/ui/network/interfaces/enp3s0",
    );
  });

  it("says plainly when this page's port has no settings here, with no offer to set it up as it is (VM fact)", async () => {
    await page("networkUnmanaged");
    await table();
    expect(screen.getByText(/which has no settings here/u)).toHaveTextContent(
      "This page reaches the NAS through enp2s0, which has no settings here. Its address is set outside these settings, and network changes made here leave it as it is.",
    );
    expect(screen.queryByText(/Set it up as it is now/u)).toBeNull();
    expect(screen.queryByText(/may leave it without an address/u)).toBeNull();
  });
});

describe("5.7: after a new interface is saved", () => {
  it("moves focus to its row once listed, and forgets the request", async () => {
    const { app } = await renderApp({
      signedIn: true,
      scenario: "networkTwo",
      path: "/account/settings",
    });
    requestRowFocus("enp3s0");
    await app.router.navigate({ to: "/network/interfaces" });
    await table();
    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).getByRole("link", { name: "enp3s0" }),
      ).toHaveFocus(),
    );
    expect(rowFocusRequest()).toBeNull();
  });
});

describe("3.2 item 4: Set up…", () => {
  it("offers each kind, with the reason beside an item that has nothing to choose from", async () => {
    const { user } = await page("networkOne");
    await table();
    await user.click(screen.getByRole("button", { name: "Set up…" }));
    const menu = await screen.findByRole("menu");
    const port = within(menu).getByRole("menuitem", {
      name: /A network port/u,
    });
    expect(port).toHaveTextContent("Every network port is set up already.");
    expect(port).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByRole("menuitem", { name: /Wi-Fi/u }),
    ).toHaveTextContent("The NAS has no Wi-Fi hardware that is free.");
    expect(
      within(menu).getByRole("menuitem", { name: /A bond/u }),
    ).toHaveTextContent(
      "A bond needs at least one network port with no settings.",
    );
    // A VLAN can run on the port with settings.
    expect(
      within(menu).getByRole("menuitem", { name: "A VLAN" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers a network port when one has no settings", async () => {
    const { user } = await page("networkTwo");
    await table();
    await user.click(screen.getByRole("button", { name: "Set up…" }));
    const menu = await screen.findByRole("menu");
    const port = within(menu).getByRole("menuitem", { name: "A network port" });
    expect(port).not.toHaveAttribute("aria-disabled", "true");
    await user.click(port);
    await waitFor(() =>
      expect(window.location.pathname).toBe("/ui/network/interfaces/add/port"),
    );
  });
});

describe("3.3: states", () => {
  it("while loading, works out which interface this page uses", async () => {
    const { app } = await renderApp({
      signedIn: true,
      scenario: "networkOne",
      path: "/account/settings",
    });
    // Answered after the scenario's own answers, so this one is asked first.
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: string };
        if (body.method === "enumerateDevicesList") {
          await delay("infinite");
        }
        return undefined;
      }),
    );
    await app.router.navigate({ to: "/network/interfaces" });
    expect(
      await screen.findByText("Working out which interface this page uses…"),
    ).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("when the interfaces cannot be read: the server's message, Try again, and Set up… unavailable", async () => {
    const { user } = await page("networkReadFails");
    expect(
      await screen.findByText("Could not read the network interfaces."),
    ).toBeVisible();
    expect(screen.getByText(/Cannot open netlink socket/u)).toBeVisible();
    expect(
      screen.getByText(
        "This page could not read the NAS's interfaces, so it cannot tell which one it uses.",
      ),
    ).toBeVisible();
    const setUp = screen.getByRole("button", { name: "Set up…" });
    expect(setUp).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText("Could not read the network interfaces.").length,
    ).toBe(2);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      callNames().filter((c) => c === "Network.enumerateDevicesList").length,
    ).toBeGreaterThan(1);
  });

  it("when the settings cannot be read: what is in use, Settings not read, and Set up… unavailable with the reason", async () => {
    await page("networkReadFailsList");
    await table();
    expect(row("enp2s0")).toHaveTextContent("Settings not read192.0.2.10/24");
    const setUp = screen.getByRole("button", { name: "Set up…" });
    expect(setUp).toHaveAttribute("aria-disabled", "true");
    expect(setUp).toHaveAccessibleDescription(
      "Could not read the network settings.",
    );
  });

  it("is empty when the NAS reports nothing but loopback and virtual interfaces", async () => {
    const empty: FixedAnswer = {
      status: 200,
      value: {
        total: 1,
        data: [
          {
            uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
            devicename: "lo",
            type: "loopback",
            address: "127.0.0.1",
            netmask: "255.0.0.0",
            prefix: 8,
            gateway: "",
            address6: "::1",
            netmask6: "",
            prefix6: 128,
            gateway6: "",
            ether: "00:00:00:00:00:00",
            mtu: "65536",
            state: "UNKNOWN",
            link: true,
            vlan: false,
            vlanid: -1,
            speed: -1,
            description: "lo",
            _used: false,
            _readonly: false,
          },
        ],
      },
    };
    await page("networkOne", { networkEnumerateDevicesList: () => empty });
    expect(
      await screen.findByText(
        "This NAS reports no network port besides virtual ones.",
      ),
    ).toBeVisible();
  });
});

describe("hostile values", () => {
  it("renders names, addresses and notes from the NAS as inert text", async () => {
    await page("networkHostile");
    await table();
    expect(row("enx00005e005301")).toHaveTextContent("This page uses it");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("14.1: a normal user", () => {
  it("gets the only-administrators page, and nothing is called first", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/network/interfaces",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(callNames()).toContain("System.getInformation"));
    for (const call of callNames()) {
      expect(call.startsWith("Network.")).toBe(false);
    }
  });
});
