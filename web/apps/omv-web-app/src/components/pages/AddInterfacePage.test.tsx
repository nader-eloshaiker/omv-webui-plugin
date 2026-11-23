// SPDX-License-Identifier: GPL-3.0-or-later
// The add pages (phase 5 network design 5 to 9, 14.2) through the whole app on MSW, with the network
// mock's stories: each kind set up with the classic defaults, the candidates read failing or empty,
// a port handed over in memory, every check of 5.3 under its field (on blur and on Save, focus on the
// first), the bond's, VLAN's and bridge's own checks and refusals (0.8), what it does to other
// computers, the save to the band with its toast and the focus request for the Interfaces page, the
// Wi-Fi password in no cache after a save (UI-6), hostile values as text, and a normal user.
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { rowFocusRequest } from "../../network/newIfaceFocus.ts";
import { handOverPort } from "../../network/portHandover.ts";
import {
  holdNetworkWritesToContract,
  networkStateOf,
} from "../../test/networkAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls, server } from "../../test/server.ts";

const TITLES = {
  port: "Set up a network port",
  wifi: "Join a Wi-Fi network",
  bond: "Make a bond",
  vlan: "Add a VLAN",
  bridge: "Make a bridge",
} as const;

async function open(
  scenario: ScenarioName,
  kind: keyof typeof TITLES,
  answers = {},
) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: `/network/interfaces/add/${kind}`,
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: TITLES[kind] });
  return view;
}

/** The form, once its reads are in. */
const ready = () =>
  screen.findByRole(
    "button",
    { name: /^(Save|Review the change…)$/u },
    { timeout: 3000 },
  );
const save = () =>
  screen.getByRole("button", { name: /^(Save|Review the change…)$/u });
/** The element whose whole text is `text` (a sentence with values in slots spans several elements). */
const sentence = (text: string | RegExp) =>
  screen.getByText((_, el) => {
    if (el === null) {
      return false;
    }
    const has = (node: Element) =>
      typeof text === "string"
        ? node.textContent === text
        : text.test(node.textContent);
    return has(el) && ![...el.children].some(has);
  });
const group = (name: string) => screen.getByRole("group", { name });
const paramsOf = (call: string) =>
  seenCalls.filter((c) => c.call === call).at(-1)?.params as
    Record<string, unknown> | undefined;

async function choose(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  combobox: string,
  option: RegExp,
) {
  await user.click(screen.getByRole("combobox", { name: combobox }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("5: set up a network port", () => {
  it("offers the free ports with their hardware address and connection, and saves the classic defaults to the band", async () => {
    const { user, mock } = await open("networkTwo", "port");
    holdNetworkWritesToContract(mock);
    await ready();
    expect(
      screen.getByText(/^This page reaches the NAS at/u),
    ).toHaveTextContent(
      "This page reaches the NAS at 192.0.2.10 through enp2s0.",
    );
    // Nothing chosen yet: Save says so and moves focus to the choice.
    await user.click(save());
    expect(await screen.findByText("Choose a port.")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Port" })).toHaveFocus(),
    );
    await choose(user, "Port", /^enp3s0/u);
    expect(screen.getByRole("combobox", { name: "Port" })).toHaveTextContent(
      "enp3s0 · 00:00:5e:00:53:02 · Not connected",
    );
    expect(screen.getByText("This page keeps working.")).toBeVisible();
    expect(save()).toHaveAccessibleName("Save");
    expect(save()).toHaveAccessibleDescription("This page keeps working.");
    await user.click(save());
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(paramsOf("Network.setEthernetIface")).toMatchObject({
      uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
      devicename: "enp3s0",
      method: "dhcp",
      method6: "manual",
      netmask6: 64,
      routemetric: 0,
      routemetric6: 1,
      mtu: 0,
      wol: false,
      altmacaddress: "",
      dnsnameservers: "",
      dnssearch: "",
      comment: "",
    });
    expect(
      await screen.findByText(
        /^The settings of .*enp3s0.* are saved\. They take effect when you apply the changes\.$/u,
      ),
    ).toBeVisible();
    // 5.7: the new row takes focus on the Interfaces page.
    await waitFor(() =>
      expect(
        within(screen.getByRole("table")).getByRole("link", { name: "enp3s0" }),
      ).toHaveFocus(),
    );
    expect(rowFocusRequest()).toBeNull();
    // Saved to the band, not applied.
    expect(callNames()).not.toContain("Config.applyChangesBg");
    expect(networkStateOf(mock).pending).toContain("systemd-networkd");
  });

  it("starts with a port handed over in memory, never in the address", async () => {
    handOverPort("enp3s0");
    await open("networkTwo", "port");
    await ready();
    expect(screen.getByRole("combobox", { name: "Port" })).toHaveTextContent(
      /^enp3s0/u,
    );
    expect(window.location.pathname).toBe("/ui/network/interfaces/add/port");
    expect(window.location.search).toBe("");
  });

  it("says when every port is set up already, with the way back", async () => {
    const { user } = await open("networkOne", "port");
    expect(
      await screen.findByText("Every network port is set up already."),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Back to the network interfaces" }),
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
  });

  it("says when the free ports could not be read, with the server's message and Try again", async () => {
    await open("networkTwo", "port", {
      networkGetEthernetCandidates: {
        status: 500,
        message: "Failed to read the <b>devices</b>.",
      },
    });
    expect(
      await screen.findByText("Could not read which ports are free."),
    ).toBeVisible();
    expect(
      screen.getByText("Failed to read the <b>devices</b>."),
    ).toBeVisible();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("goes back to the list on Cancel, saving nothing", async () => {
    const { user } = await open("networkTwo", "port");
    await ready();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });
});

describe("5.3: checks in the browser, on blur and on Save", () => {
  async function fixed() {
    const view = await open("networkTwo", "port");
    await ready();
    await choose(view.user, "Port", /^enp3s0/u);
    await view.user.click(
      within(group("IPv4")).getByRole("radio", {
        name: /^A fixed address I choose/u,
      }),
    );
    return view;
  }
  const v4 = (name: string | RegExp) =>
    within(group("IPv4")).getByRole("textbox", { name });

  it.each([
    ["nonsense", "24", "", "Write an IPv4 address such as 192.0.2.10."],
    [
      "192.0.2.0",
      "24",
      "",
      "192.0.2.0 is the address of the network itself. Choose one between 192.0.2.1 and 192.0.2.254.",
    ],
    ["127.0.0.1", "8", "", "127.0.0.1 cannot be the NAS's address."],
    [
      "192.0.2.20",
      "33",
      "",
      "Write a size from 1 to 32, such as 24, or a mask such as 255.255.255.0.",
    ],
    [
      "192.0.2.20",
      "24",
      "198.51.100.1",
      "The router address 198.51.100.1 is not on the network 192.0.2.0/24. Check the address and the network size.",
    ],
    [
      "192.0.2.20",
      "24",
      "192.0.2.20",
      "The router address must be the router's, not the NAS's own.",
    ],
    ["192.0.2.10", "24", "", "enp2s0 already uses 192.0.2.10."],
  ])("%s/%s via %s: %s", async (address, size, router, message) => {
    const { user } = await fixed();
    await user.type(v4("Address"), address);
    await user.type(v4("Network size"), size);
    if (router !== "") {
      await user.type(v4(/^Router address/u), router);
    }
    await user.tab();
    expect(sentence(message)).toBeVisible();
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });

  it("shows the network the size makes as it is typed", async () => {
    const { user } = await fixed();
    await user.type(v4("Address"), "192.0.2.20");
    await user.type(v4("Network size"), "255.255.255.0");
    expect(sentence(/^Network 192\.0\.2\.0\/24:/u)).toHaveTextContent(
      "Network 192.0.2.0/24: 192.0.2.1 to 192.0.2.254, 254 addresses for devices",
    );
  });

  it("asks for a name server with a router address, and checks name servers and search domains", async () => {
    const { user } = await fixed();
    await user.type(v4("Address"), "192.0.2.20");
    await user.type(v4("Network size"), "24");
    await user.type(v4(/^Router address/u), "192.0.2.1");
    await user.click(save());
    expect(
      await screen.findByText(
        "Add a name server, or the NAS cannot look up names.",
      ),
    ).toBeVisible();
    // Focus moves to the first refused field.
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Name servers" }),
      ).toHaveFocus(),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name servers" }),
      "nonsense",
    );
    await user.type(
      screen.getByRole("textbox", { name: /^Search domains/u }),
      "bad_domain!",
    );
    await user.tab();
    expect(
      sentence(
        "nonsense is not an address. Write each name server's address, such as 192.0.2.1.",
      ),
    ).toBeVisible();
    expect(
      sentence("bad_domain! is not a domain such as example.org."),
    ).toBeVisible();
  });

  it("checks a fixed IPv6 address and its prefix length", async () => {
    const { user } = await open("networkTwo", "port");
    await ready();
    await user.click(
      within(group("IPv6")).getByRole("radio", {
        name: /^A fixed address I choose/u,
      }),
    );
    const v6 = (name: string) =>
      within(group("IPv6")).getByRole("textbox", { name });
    await user.type(v6("Address"), "zz::1");
    await user.clear(v6("Prefix length"));
    await user.type(v6("Prefix length"), "129");
    await user.tab();
    expect(
      screen.getByText("Write an IPv6 address such as 2001:db8::10."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Write a prefix length from 1 to 128; it is almost always 64.",
      ),
    ).toBeVisible();
  });

  it("checks Advanced's packet size, hardware address and route priority, opening it on Save", async () => {
    const { user } = await fixed();
    await user.type(v4("Address"), "192.0.2.20");
    await user.type(v4("Network size"), "24");
    await user.type(v4(/^Router address/u), "192.0.2.1");
    await user.type(
      screen.getByRole("textbox", { name: "Name servers" }),
      "192.0.2.1",
    );
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("radio", { name: "Another size" }));
    await user.type(screen.getByRole("textbox", { name: /^Size/u }), "100");
    await user.type(
      screen.getByRole("textbox", {
        name: /^Use a different hardware address/u,
      }),
      "01:00:5e:00:53:01",
    );
    const metric = screen.getByRole("textbox", { name: "IPv4 route priority" });
    await user.clear(metric);
    await user.type(metric, "70000");
    // Closed again: Save opens it and moves focus to the first refusal inside.
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(save());
    expect(
      await screen.findByText(
        "Write a size from 576 to 9216 bytes, or choose Standard. With IPv6 on, the smallest is 1280.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Write six pairs of hexadecimal digits separated by colons, such as 00:00:5e:00:53:01, with an even first pair.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Write a route priority from 0 to 65535."),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /^Size/u })).toHaveFocus(),
    );
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });
});

describe("6: join a Wi-Fi network", () => {
  it("asks for the password, sends it once, and keeps it in no cache, toast or page (UI-6)", async () => {
    const { user, app, mock } = await open("networkWifi", "wifi");
    holdNetworkWritesToContract(mock);
    await ready();
    await choose(user, "Wi-Fi hardware", /^wlp4s0/u);
    await user.type(
      screen.getByRole("textbox", { name: "Network name" }),
      "EXAMPLE-NETWORK",
    );
    const password = "typed-Wifi-Pw7";
    const field = screen.getByLabelText("Wi-Fi password");
    expect(field).toHaveValue("");
    await user.type(field, "short");
    await user.click(save());
    expect(
      await screen.findByText(
        "Write the password, 8 to 63 characters (or 64 hexadecimal digits).",
      ),
    ).toBeVisible();
    await user.clear(screen.getByLabelText("Wi-Fi password"));
    await user.type(screen.getByLabelText("Wi-Fi password"), password);
    await user.click(screen.getByRole("radio", { name: "WPA3-Personal" }));
    await user.click(screen.getByRole("radio", { name: "5 GHz" }));
    await user.click(save());
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(paramsOf("Network.setWirelessIface")).toMatchObject({
      devicename: "wlp4s0",
      wpassid: "EXAMPLE-NETWORK",
      wpapsk: password,
      keymanagement: "sae",
      band: "5GHz",
      hidden: false,
    });
    expect(
      await screen.findByText(/^The Wi-Fi settings of .*wlp4s0/u),
    ).toBeVisible();
    const caches = JSON.stringify([
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
      app.queryClient
        .getMutationCache()
        .getAll()
        .map((m) => [m.state.variables, m.state.data]),
    ]);
    expect(caches).not.toContain(password);
    expect(caches).not.toContain("EXAMPLE-PASSWORD");
    expect(markupOf()).not.toContain(password);
  });

  it("says when there is no free Wi-Fi hardware", async () => {
    await open("networkTwo", "wifi");
    expect(
      await screen.findByText("The NAS has no Wi-Fi hardware that is free."),
    ).toBeVisible();
  });
});

describe("7: make a bond", () => {
  it("lists this page's port unavailable, warns about one port, needs a main port, and sends the transmit hash policy", async () => {
    const { user, mock } = await open("networkTwo", "bond");
    holdNetworkWritesToContract(mock);
    await ready();
    const ports = screen.getByRole("group", { name: "Ports in the bond" });
    const own = within(ports).getByRole("checkbox", { name: /^enp2s0/u });
    expect(own).toHaveAttribute("aria-disabled", "true");
    expect(ports).toHaveTextContent(
      "This page reaches the NAS through it. Connect this computer through another interface first, then change enp2s0 from there.",
    );
    expect(screen.getByText(/^The NAS names it/u)).toHaveTextContent(
      "The NAS names it bond0.",
    );
    expect(
      screen.getByText(
        "The bond uses the hardware address of its first port, so your router usually gives it the address that port had.",
      ),
    ).toBeVisible();
    await user.click(save());
    expect(await screen.findByText("Choose at least one port.")).toBeVisible();
    await user.click(within(ports).getByRole("checkbox", { name: /^enp3s0/u }));
    expect(
      screen.getByText(
        "A bond of one port does not protect against anything. Choose at least two.",
      ),
    ).toBeVisible();
    await user.click(save());
    expect(await screen.findByText("Choose the main port.")).toBeVisible();
    // 802.3ad needs no main port.
    await user.click(
      screen.getByRole("radio", { name: /^Combine the ports' speed/u }),
    );
    expect(screen.queryByRole("combobox", { name: "Main port" })).toBeNull();
    await user.click(
      screen.getByRole("radio", { name: /^Keep working if a port fails/u }),
    );
    await choose(user, "Main port", /^enp3s0$/u);
    // The bond's own Advanced comes first; the form's follows.
    const [timing] = screen.getAllByRole("button", { name: "Advanced" });
    if (timing === undefined) {
      throw new Error("no Advanced");
    }
    await user.click(timing);
    expect(
      screen.getByText("Checks each port's link every 100 ms"),
    ).toBeVisible();
    await user.click(save());
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(paramsOf("Network.setBondIface")).toMatchObject({
      devicename: "",
      slaves: ["enp3s0"],
      bondmode: 1,
      bondprimary: "enp3s0",
      bondmiimon: 100,
      bonddowndelay: 0,
      bondupdelay: 0,
      bondtransmithashpolicy: "layer2",
    });
    expect(
      await screen.findByText(
        "The bond is saved. It takes effect when you apply the changes.",
      ),
    ).toBeVisible();
    expect(rowFocusRequest()).toBe("bond0");
  });

  it("says when no port is free for a bond", async () => {
    await open("networkOne", "bond");
    expect(
      await screen.findByText(
        "A bond needs at least one network port with no settings.",
      ),
    ).toBeVisible();
  });
});

describe("8: add a VLAN", () => {
  it("checks the ID, names it, refuses its parent's network, and saves to the band (Brief interruption)", async () => {
    const { user, mock } = await open("networkTwo", "vlan");
    holdNetworkWritesToContract(mock);
    await ready();
    await choose(user, "Runs on", /^enp2s0/u);
    const id = screen.getByRole("textbox", { name: "VLAN ID" });
    await user.type(id, "4095");
    await user.tab();
    expect(screen.getByText("Write a VLAN ID from 1 to 4094.")).toBeVisible();
    await user.clear(id);
    await user.type(id, "10");
    expect(screen.getByText(/^The NAS names it/u)).toHaveTextContent(
      "The NAS names it enp2s0.10.",
    );
    await user.click(
      within(group("IPv4")).getByRole("radio", {
        name: /^A fixed address I choose/u,
      }),
    );
    await user.type(
      within(group("IPv4")).getByRole("textbox", { name: "Address" }),
      "192.0.2.50",
    );
    await user.type(
      within(group("IPv4")).getByRole("textbox", { name: "Network size" }),
      "24",
    );
    await user.tab();
    expect(
      sentence(
        "enp2s0 already uses the network 192.0.2.0/24. A VLAN is a separate network; give it addresses of its own.",
      ),
    ).toBeVisible();
    await user.click(
      within(group("IPv4")).getByRole("radio", {
        name: /^Automatically from the router/u,
      }),
    );
    expect(
      screen.getByText(
        "This page may stop responding for a few seconds while the network restarts, then carries on.",
      ),
    ).toBeVisible();
    await user.click(save());
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(paramsOf("Network.setVlanIface")).toMatchObject({
      devicename: "enp2s0.10",
      vlanrawdevice: "enp2s0",
      vlanid: 10,
    });
  });

  it("refuses an ID its parent already has", async () => {
    const { user } = await open("networkLayers", "vlan");
    await ready();
    await choose(user, "Runs on", /^bond0/u);
    await user.type(screen.getByRole("textbox", { name: "VLAN ID" }), "10");
    await user.tab();
    expect(sentence("bond0 already has a VLAN with ID 10.")).toBeVisible();
  });
});

describe("9: make a bridge", () => {
  it("offers free ports, lists this page's interface unavailable, and saves one with none", async () => {
    const { user, mock } = await open("networkTwo", "bridge");
    holdNetworkWritesToContract(mock);
    await ready();
    const members = screen.getByRole("group", {
      name: /^Interfaces in the bridge/u,
    });
    expect(
      within(members).getByRole("checkbox", { name: /^enp3s0/u }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      within(members).getByRole("checkbox", { name: /^enp2s0/u }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/^The NAS names it/u)).toHaveTextContent(
      "The NAS names it br0.",
    );
    expect(
      screen.getByText(
        "The bridge gets its own hardware address, so your router sees it as a new device and may give it a new address.",
      ),
    ).toBeVisible();
    await user.click(save());
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
    expect(paramsOf("Network.setBridgeIface")).toMatchObject({
      devicename: "",
      slaves: [],
    });
  });

  it("does not offer a bond that has settings, which OMV lists (VM fact)", async () => {
    await open("networkLayers", "bridge");
    await ready();
    const members = screen.getByRole("group", {
      name: /^Interfaces in the bridge/u,
    });
    expect(
      within(members).queryByRole("checkbox", { name: /^bond0 /u }),
    ).toBeNull();
    // The VLAN this page uses is listed, unavailable.
    expect(
      within(members).getByRole("checkbox", { name: /^bond0\.10/u }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("5.8 and 0.5: saving, and a page that cannot tell its interface", () => {
  it("shows Saving… with the fields read-only while the request is under way", async () => {
    const { user } = await open("networkTwo", "port");
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: string };
        if (body.method === "setEthernetIface") {
          await delay(400);
        }
        return undefined;
      }),
    );
    await ready();
    await choose(user, "Port", /^enp3s0/u);
    await user.click(save());
    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toBeVisible();
    expect(
      within(group("Name servers (DNS)")).getByRole("textbox", {
        name: "Name servers",
      }),
    ).toHaveAttribute("readonly");
    await screen.findByRole("heading", {
      level: 1,
      name: "Network interfaces",
    });
  });

  it("opens the change flow for a new VLAN when the page cannot tell which interface it uses (May cut)", async () => {
    const { user } = await open("networkUnknown", "vlan");
    await ready();
    await choose(user, "Runs on", /^enp2s0/u);
    await user.type(screen.getByRole("textbox", { name: "VLAN ID" }), "20");
    expect(save()).toHaveAccessibleName("Review the change…");
    await user.click(save());
    expect(
      await screen.findByRole("heading", { name: /^Review the change to/u }),
    ).toHaveTextContent("Review the change to enp2s0.20");
    expect(
      screen.getByRole("textbox", {
        name: "Type the interface's name to confirm: enp2s0.20",
      }),
    ).toBeVisible();
    expect(callNames()).not.toContain("Network.setVlanIface");
  });

  it("shows a 15-character name and a long domain from the NAS as text", async () => {
    await open("networkHostile", "port");
    await ready();
    expect(screen.getByRole("combobox", { name: "Port" })).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: /^Search domains/u }),
    ).toHaveAttribute(
      "placeholder",
      `${"d".repeat(63)}.${"e".repeat(63)}.${"f".repeat(60)}.example.org`,
    );
    expect(markupOf()).not.toContain("<img src=");
  });
});

describe("14.1: a normal user", () => {
  it("gets the only-administrators page and nothing network is called", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/network/interfaces/add/port",
    });
    expect(await screen.findByText(/only administrators/iu)).toBeVisible();
    expect(callNames().some((c) => c.startsWith("Network."))).toBe(false);
  });
});
