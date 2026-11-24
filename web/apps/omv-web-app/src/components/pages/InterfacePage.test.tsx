// SPDX-License-Identifier: GPL-3.0-or-later
// An interface's page (phase 5 network design 4, 10) through the whole app on MSW, with the network
// mock's stories: the route refusing an invalid name without a call (D3, UI-4) and a name the NAS
// does not have; Now from getInformation; Settings with "In use now" where it differs; "Not set up
// here" with the port handed over in memory; the plain line for this page's port without settings
// (VM fact 18.2 #7); members; the refusals of 10.1; the destructive confirmation and what follows it;
// the change flow when the page cannot tell its interface; the states of 4.3; no Wi-Fi password
// anywhere; hostile values; and a normal user.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import {
  EXAMPLE_PASSWORD,
  NETWORK_IFACES,
  pageAt,
} from "../../test/networkAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls } from "../../test/server.ts";

async function page(scenario: ScenarioName, iface: string, answers = {}) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: `/network/interfaces/${iface}`,
    answers,
  });
  return view;
}

const region = (name: string) => screen.findByRole("region", { name });

describe("14.2: the route", () => {
  it("refuses a name that is not a kernel interface name, without a call about it", async () => {
    await page("networkTwo", "eth0:1");
    expect(
      await screen.findByText("This NAS has no interface by that name."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to the network interfaces" }),
    ).toHaveAttribute("href", "/ui/network/interfaces");
    for (const call of callNames()) {
      expect(call.startsWith("Network.")).toBe(false);
    }
  });

  it("refuses a name of 16 characters", async () => {
    await page("networkTwo", "enx00005e0053011");
    expect(
      await screen.findByText("This NAS has no interface by that name."),
    ).toBeVisible();
  });

  it("says when the NAS has no interface of that name, naming it, and asks nothing about it", async () => {
    await page("networkTwo", "eth9");
    expect(
      await screen.findByText(/This NAS has no interface named/u),
    ).toHaveTextContent("This NAS has no interface named eth9.");
    expect(callNames()).not.toContain("Network.getInformation");
  });
});

describe("4.2: this page's port", () => {
  it("shows what it does now and how it is set up, and refuses to remove its settings", async () => {
    await page("networkTwo", "enp2s0");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Network port/u }),
    ).toHaveTextContent("enp2s0Network port");
    expect(
      screen.getByText(/^This page reaches the NAS through this interface/u),
    ).toBeVisible();
    const now = await region("Now");
    await within(now).findByText("Working");
    expect(now).toHaveTextContent("Connected at 1 Gbit/s");
    expect(now).toHaveTextContent("IPv4 address192.0.2.10/24");
    expect(now).toHaveTextContent("Router address192.0.2.1");
    expect(now).toHaveTextContent("Hardware address00:00:5e:00:53:01");
    expect(now).toHaveTextContent("Packet size1500 bytes");
    expect(now).toHaveTextContent("Speed1 Gbit/s");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent("IPv4Fixed address192.0.2.10/24");
    expect(settings).toHaveTextContent("Router address192.0.2.1");
    expect(settings).toHaveTextContent("IPv6Off");
    expect(settings).toHaveTextContent("Packet sizeStandard");
    expect(settings).toHaveTextContent("Wake-on-LANOff");
    expect(within(settings).queryByText("Not applied yet")).toBeNull();
    expect(
      within(settings).getByRole("button", { name: "Change settings" }),
    ).toBeVisible();
    const remove = await region("Remove its settings");
    expect(remove).toHaveTextContent(
      "This page reaches the NAS through enp2s0. Removing its settings would cut it off. Connect this computer through another interface first, then change enp2s0 from there.",
    );
    expect(within(remove).queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Blink its light…" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /^Network interfaces in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/network/interfaces");
    const info = seenCalls.find((c) => c.call === "Network.getInformation");
    expect(info?.params).toEqual({ devicename: "enp2s0" });
  });

  it("opens the form in place of the settings card", async () => {
    const { user } = await page("networkTwo", "enp2s0");
    const settings = await region("Settings");
    await user.click(
      within(settings).getByRole("button", { name: "Change settings" }),
    );
    expect(
      screen.queryByRole("button", { name: "Change settings" }),
    ).toBeNull();
    // The removal card steps aside while the form is open.
    expect(
      screen.queryByRole("region", { name: "Remove its settings" }),
    ).toBeNull();
  });
});

describe("4.2 item 5: not set up here", () => {
  it("offers to set up the port, handing it over in memory, not in the address", async () => {
    const { user } = await page("networkTwo", "enp3s0");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent(
      "This port has no settings here, so it gets no address and the NAS cannot be reached through it.",
    );
    expect(
      screen.queryByRole("region", { name: "Remove its settings" }),
    ).toBeNull();
    await user.click(
      within(settings).getByRole("button", { name: "Set up this port…" }),
    );
    await waitFor(() =>
      expect(window.location.pathname).toBe("/ui/network/interfaces/add/port"),
    );
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("says plainly when this page's port has its address from outside these settings (VM fact)", async () => {
    await page("networkUnmanaged", "enp2s0");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent(
      "This page reaches the NAS through this port, which has no settings here. Its address is set outside these settings, and network changes made here leave it as it is.",
    );
    expect(
      within(settings).getByRole("button", { name: "Set up this port…" }),
    ).toBeVisible();
    expect(screen.queryByText(/Set it up as it is now/u)).toBeNull();
  });
});

describe("4.2: layers", () => {
  it("lists a bond's ports and refuses to remove a bond under this page's VLAN", async () => {
    await page("networkLayers", "bond0");
    const now = await region("Now");
    await within(now).findByText("Ports");
    expect(within(now).getByRole("link", { name: "enp3s0" })).toHaveAttribute(
      "href",
      "/ui/network/interfaces/enp3s0",
    );
    expect(within(now).getByRole("link", { name: "enp26s0" })).toBeVisible();
    const settings = await region("Settings");
    expect(settings).toHaveTextContent("ModeKeep working if a port fails");
    expect(settings).toHaveTextContent("Main portenp3s0");
    expect(settings).toHaveTextContent("Checks each port's link every 100 ms");
    const remove = await region("Remove its settings");
    expect(remove).toHaveTextContent(
      "This page reaches the NAS through bond0.10, which runs on bond0.",
    );
    expect(within(remove).queryByRole("button")).toBeNull();
  });

  it("says a bond's port has no settings of its own", async () => {
    await page("networkLayers", "enp3s0");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent(
      "This port is part of bond0. Its settings are the bond's.",
    );
    expect(
      screen.queryByRole("region", { name: "Remove its settings" }),
    ).toBeNull();
  });

  it("says a bridge's interface has no settings of its own", async () => {
    await page("networkLayers", "enp4s0");
    expect(await region("Settings")).toHaveTextContent(
      "This interface is part of br0. Its settings are the bridge's.",
    );
  });

  it("shows a VLAN's ID and what it runs on", async () => {
    await page("networkLayers", "bond0.10");
    const now = await region("Now");
    expect(await within(now).findByText(/VLAN ID/u)).toHaveTextContent(
      "VLAN ID 10, runs on bond0",
    );
  });

  it("refuses to remove an interface a VLAN runs on, with a link to the VLAN", async () => {
    const { app } = await renderApp({
      signedIn: true,
      scenario: "networkLayers",
      path: "/account/settings",
    });
    pageAt({ protocol: "http:", hostname: "192.0.2.128", port: "" });
    await app.router.navigate({
      to: "/network/interfaces/$iface",
      params: { iface: "bond0" },
    });
    const remove = await region("Remove its settings");
    expect(remove).toHaveTextContent(
      "The VLAN bond0.10 runs on bond0. Remove the VLAN first.",
    );
    expect(
      within(remove).getByRole("link", { name: "bond0.10" }),
    ).toHaveAttribute("href", "/ui/network/interfaces/bond0.10");
  });
});

describe("10.2: removing an interface's settings", () => {
  it("confirms in the destructive form with what is lost, and returns to the list for a bridge", async () => {
    const { user } = await page("networkLayers", "br0");
    const remove = await region("Remove its settings");
    await user.click(
      within(remove).getByRole("button", { name: "Remove settings…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Remove the settings of br0?",
    );
    expect(dialog).toHaveTextContent(
      "After the changes are applied, br0 has no address, and the NAS cannot be reached through it. It uses 192.0.2.140/24 now.",
    );
    expect(dialog).toHaveTextContent(
      "Its interfaces enp4s0 are freed and have no settings. Virtual machines and containers that use it lose their network.",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Remove settings" }),
    );
    expect(
      (
        await screen.findAllByText(
          /are removed\. This takes effect when you apply the changes\./u,
        )
      )[0],
    ).toHaveTextContent(
      "The settings of br0 are removed. This takes effect when you apply the changes.",
    );
    const sent = seenCalls.find((c) => c.call === "Network.deleteInterface");
    expect(sent?.params).toEqual({ uuid: NETWORK_IFACES.br0 });
    const title = await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("leaves a port on its page, now not set up here", async () => {
    const { user } = await page("networkApply", "enp3s0");
    const remove = await region("Remove its settings");
    await user.click(
      within(remove).getByRole("button", { name: "Remove settings…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "Its fixed address 203.0.113.10 is free for other devices.",
    );
    expect(dialog).not.toHaveTextContent(/It uses/u);
    await user.click(
      within(dialog).getByRole("button", { name: "Remove settings" }),
    );
    expect(
      await screen.findByText(
        "This port has no settings here, so it gets no address and the NAS cannot be reached through it.",
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Settings" })).toHaveFocus(),
    );
  });

  it("goes through the change flow when the page cannot tell which interface it uses", async () => {
    const { user } = await page("networkByNameTwo", "enp3s0");
    const remove = await region("Remove its settings");
    await user.click(
      within(remove).getByRole("button", { name: "Remove settings…" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Review the change to enp3s0",
      }),
    ).toBeVisible();
    expect(callNames()).not.toContain("Network.deleteInterface");
  });
});

describe("4.2: settings that differ from what is in use", () => {
  it("shows In use now with the pending mark", async () => {
    await page("networkPending", "enp3s0");
    const settings = await region("Settings");
    expect(
      await within(settings).findByText(/^In use now:/u),
    ).toHaveTextContent("In use now: 203.0.113.10/24");
    expect(settings).toHaveTextContent("IPv4Fixed address203.0.113.11/24");
    expect(
      within(settings).getAllByText("Not applied yet").length,
    ).toBeGreaterThan(0);
  });
});

describe("4.3: states", () => {
  it("when the settings cannot be read: the message, and Change and Remove unavailable", async () => {
    await page("networkReadFailsList", "enp2s0");
    expect(
      await screen.findByText(/Could not read the settings of/u),
    ).toHaveTextContent("Could not read the settings of enp2s0.");
    expect(
      screen.getByRole("button", { name: "Change settings" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Remove settings…" }),
    ).toHaveAttribute("aria-disabled", "true");
    // Now is still shown.
    expect(
      await within(await region("Now")).findByText("Working"),
    ).toBeVisible();
  });

  it("when what it does now cannot be read: the message in Now, and Settings still shown", async () => {
    await page("networkReadFailsInterface", "enp2s0");
    expect(await screen.findByText(/Could not read what/u)).toHaveTextContent(
      "Could not read what enp2s0 is doing now.",
    );
    expect(screen.getByText(/Cannot open netlink socket/u)).toBeVisible();
    expect(await region("Settings")).toHaveTextContent("Fixed address");
  });
});

describe("Wi-Fi", () => {
  it("says the password is set, and the password is nowhere in the page or the caches", async () => {
    const { app } = await page("networkWifi", "wlp3s0");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent("Network nameEXAMPLE-NETWORK");
    expect(settings).toHaveTextContent("SecurityWPA2-Personal");
    expect(settings).toHaveTextContent("Wi-Fi passwordSet");
    expect(settings).toHaveTextContent("FrequencyAutomatic");
    // Find this port is for network ports only.
    expect(
      screen.queryByRole("button", { name: "Blink its light…" }),
    ).toBeNull();
    expect(markupOf()).not.toContain(EXAMPLE_PASSWORD);
    expect(
      JSON.stringify(
        app.queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(EXAMPLE_PASSWORD);
  });
});

describe("hostile values", () => {
  it("renders a note and names from the NAS as inert text", async () => {
    await page("networkHostile", "enx00005e005301");
    const settings = await region("Settings");
    expect(settings).toHaveTextContent(/<img src=x onerror="alert\(1\)">/u);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("14.1: a normal user", () => {
  it("gets the only-administrators page, and nothing is called first", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/network/interfaces/enp2s0",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeVisible();
    for (const call of callNames()) {
      expect(call.startsWith("Network.")).toBe(false);
    }
  });
});
