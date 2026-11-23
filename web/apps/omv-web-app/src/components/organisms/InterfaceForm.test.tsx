// SPDX-License-Identifier: GPL-3.0-or-later
// Changing an interface's settings in place (phase 5 network design 5.4 to 5.8, 6.2, 7, 0.5, 0.6, 1.4)
// through the whole app on MSW, with the network mock's stories: the class line under Save while
// typing, "Review the change…" opening the change flow in place for Moves and May cut (and Back with
// the values), the refused family (5.5), both families off on another interface, the straight save
// with its toast, changed elsewhere (5.8), OMV's refusals (400 and 500) as text, the Wi-Fi password
// asked on every save and never in the summary, the page or a cache, a bond on this page's path, a
// failed read, and hostile values as inert text.
import { Toaster, UiProvider } from "@omv-webui/react-ui-components";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { App } from "../../app.ts";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import {
  holdNetworkWritesToContract,
  NETWORK_IFACES,
  networkStateOf,
} from "../../test/networkAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls } from "../../test/server.ts";
import { InterfaceForm, type InterfaceKind } from "./InterfaceForm.tsx";

function Providers({ app, children }: { app: App; children: ReactNode }) {
  return (
    <UiProvider>
      <QueryClientProvider client={app.queryClient}>
        <RouterContextProvider router={app.router}>
          {children}
          <Toaster closeLabel="Close" regionLabel="Notifications" />
        </RouterContextProvider>
      </QueryClientProvider>
    </UiProvider>
  );
}

function Harness({
  kind,
  devicename,
  uuid,
}: {
  kind: InterfaceKind;
  devicename: string;
  uuid: string;
}) {
  const [where, setWhere] = useState("form");
  if (where !== "form") {
    return <p>left the form: {where}</p>;
  }
  return (
    <InterfaceForm
      mode="change"
      kind={kind}
      devicename={devicename}
      uuid={uuid}
      onCancel={() => setWhere("cancel")}
      onSaved={(name) => setWhere(`saved ${name}`)}
    />
  );
}

async function change(
  scenario: ScenarioName,
  kind: InterfaceKind,
  devicename: string,
  uuid: string,
  answers = {},
) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: "/account/settings",
    answers,
  });
  // The form alone, on the booted app's client and router: the shell's own ids would share React's
  // id sequence with this second root.
  view.unmount();
  render(
    <Providers app={view.app}>
      <Harness kind={kind} devicename={devicename} uuid={uuid} />
    </Providers>,
  );
  return view;
}

const opened = () =>
  screen.findByRole(
    "heading",
    { level: 2, name: /^Change the settings of/u },
    { timeout: 3000 },
  );
const save = () =>
  screen.getByRole("button", { name: /^(Save|Review the change…)$/u });
const group = (name: string) => screen.getByRole("group", { name });
const v4 = (name: string | RegExp) =>
  within(group("IPv4")).getByRole("textbox", { name });
const paramsOf = (call: string) =>
  seenCalls.filter((c) => c.call === call).at(-1)?.params as
    Record<string, unknown> | undefined;
/** The text of what an element's aria-describedby points at (the wiring of 19.2). */
const described = (el: HTMLElement): string =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .map((id) =>
      id === "" ? "" : (document.getElementById(id)?.textContent ?? ""),
    )
    .join(" ")
    .trim();
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

describe("5.4 and 1.4: a change that moves this page goes through the change flow", () => {
  it("reads Review the change… with the class under it, opens the flow in place, and Back keeps the values", async () => {
    const { user } = await change(
      "networkTwo",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    expect(screen.getByText("Reading the settings…")).toBeInTheDocument();
    await opened();
    expect(v4("Address")).toHaveValue("192.0.2.10");
    // The stored settings have a router address and no name server, which 5.3 asks for.
    await user.type(
      screen.getByRole("textbox", { name: "Name servers" }),
      "192.0.2.1",
    );
    expect(save()).toHaveAccessibleName("Save");
    await user.clear(v4("Address"));
    await user.type(v4("Address"), "192.0.2.20");
    expect(save()).toHaveAccessibleName("Review the change…");
    expect(described(save())).toMatch(
      /^This page stops working at 192\.0\.2\.10\. The NAS will be at 192\.0\.2\.20\./u,
    );
    expect(
      sentence(
        "Computers that reach the NAS at 192.0.2.10 (shared folders, bookmarks, copy jobs) must use 192.0.2.20.",
      ),
    ).toBeVisible();
    await user.click(save());
    expect(
      await screen.findByRole("heading", { name: /^Review the change to/u }),
    ).toHaveTextContent("Review the change to enp2s0");
    expect(
      screen.getByRole("textbox", {
        name: "Type the new address to confirm it: 192.0.2.20",
      }),
    ).toBeVisible();
    expect(callNames()).not.toContain("Network.setEthernetIface");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await opened();
    expect(v4("Address")).toHaveValue("192.0.2.20");
    await waitFor(() => expect(save()).toHaveFocus());
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });
});

describe("5.5: refused on this page's interface", () => {
  it("refuses turning this page's family off, with the reason, and Save stays unavailable", async () => {
    const { user } = await change(
      "networkTwo",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    await opened();
    await user.click(
      within(group("IPv4")).getByRole("radio", { name: /^Off/u }),
    );
    const reason =
      "This page reaches the NAS over IPv4 through enp2s0. Turning IPv4 off would cut it off. Connect this computer through another interface first, then change enp2s0 from there.";
    await waitFor(() =>
      expect(save()).toHaveAttribute("aria-disabled", "true"),
    );
    expect(described(save())).toBe(reason);
    expect(
      screen.getAllByText((_, el) => el?.textContent === reason).length,
    ).toBeGreaterThan(0);
    await user.click(save());
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });
});

describe("5.5 and 5.7: another interface", () => {
  it("allows both families off with its line, and saves straight to the band with the toast", async () => {
    const { user, mock } = await change(
      "networkLayers",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    holdNetworkWritesToContract(mock);
    await opened();
    await user.click(
      within(group("IPv4")).getByRole("radio", { name: /^Off/u }),
    );
    await user.click(
      within(group("IPv6")).getByRole("radio", { name: /^Off/u }),
    );
    expect(
      sentence("With both off, the NAS cannot be reached through enp2s0."),
    ).toBeVisible();
    expect(save()).toHaveAccessibleName("Save");
    expect(described(save())).toBe("This page keeps working.");
    const before = seenCalls.length;
    await user.click(save());
    expect(
      await screen.findByText("left the form: saved enp2s0"),
    ).toBeVisible();
    expect(paramsOf("Network.setEthernetIface")).toMatchObject({
      uuid: NETWORK_IFACES.enp2s0,
      devicename: "enp2s0",
      method: "manual",
      method6: "manual",
    });
    expect(
      await screen.findByText(
        /^The settings of .*enp2s0.* are saved\. They take effect when you apply the changes\.$/u,
      ),
    ).toBeVisible();
    // Read again immediately before the write (R4).
    const names = callNames().slice(before);
    expect(names.slice(0, names.indexOf("Network.setEthernetIface"))).toContain(
      "Network.getInterface",
    );
    expect(networkStateOf(mock).pending).toContain("systemd-networkd");
  });

  it("says when nothing changed, and writes nothing", async () => {
    const { user } = await change(
      "networkLayers",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    await opened();
    await user.click(save());
    expect(await screen.findByText("No changes to save")).toBeVisible();
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });
});

describe("5.8: states", () => {
  it("shows the newer settings when they changed elsewhere, and writes nothing", async () => {
    const { user, mock } = await change(
      "networkLayers",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    await opened();
    await user.type(
      screen.getByRole("textbox", { name: "Name servers" }),
      "192.0.2.53",
    );
    const state = networkStateOf(mock);
    state.config.ifaces = state.config.ifaces.map((i) =>
      i.devicename === "enp2s0"
        ? { ...i, dnsnameservers: ["198.51.100.53"] }
        : i,
    );
    await user.click(save());
    expect(
      await screen.findByText(/was changed since you opened it/u),
    ).toHaveTextContent(
      "enp2s0 was changed since you opened it. Its new settings are shown; make your change again.",
    );
    expect(screen.getByRole("textbox", { name: "Name servers" })).toHaveValue(
      "198.51.100.53",
    );
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });

  it.each([
    [400, "dnsnameservers: The value '<b>x</b>' is not valid."],
    [500, "Failed to apply <img src=x onerror=alert(1)> settings."],
  ])(
    "shows OMV's refusal (HTTP %i) as text and keeps the values",
    async (status, message) => {
      const { user } = await change(
        "networkLayers",
        "ethernet",
        "enp2s0",
        NETWORK_IFACES.enp2s0,
        { networkSetEthernetIface: { status, message } },
      );
      await opened();
      await user.type(
        screen.getByRole("textbox", { name: "Name servers" }),
        "192.0.2.53",
      );
      await user.click(save());
      expect(
        await screen.findByText("The settings were not saved."),
      ).toBeVisible();
      expect(screen.getByText(message)).toBeVisible();
      expect(document.querySelector("img[src='x'], b")).toBeNull();
      expect(screen.getByRole("textbox", { name: "Name servers" })).toHaveValue(
        "192.0.2.53",
      );
    },
  );

  it("says when the settings could not be read, with the server's message and Try again", async () => {
    await change(
      "networkReadFailsInterface",
      "ethernet",
      "enp2s0",
      NETWORK_IFACES.enp2s0,
    );
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent === "Could not read the settings of enp2s0.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/Failed to execute XPath query/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

describe("6.2: this page's Wi-Fi", () => {
  it("asks for the password on every save, opens the flow, and never shows or keeps the password", async () => {
    const { user, app } = await change(
      "networkWifi",
      "wifi",
      "wlp3s0",
      NETWORK_IFACES.wlp3s0,
    );
    await opened();
    expect(screen.getByText("Password: Set")).toBeVisible();
    const field = screen.getByLabelText("Type the Wi-Fi password to save");
    expect(field).toHaveValue("");
    expect(field).toHaveAccessibleDescription(
      /The NAS does not give it back to this page\. Type the same password to keep it, or a new one\./u,
    );
    expect(screen.getByRole("textbox", { name: "Network name" })).toHaveValue(
      "EXAMPLE-NETWORK",
    );
    await user.click(save());
    expect(
      await screen.findByText(
        "Write the password, 8 to 63 characters (or 64 hexadecimal digits).",
      ),
    ).toBeVisible();
    const password = "typed-again-Pw8";
    await user.type(
      screen.getByLabelText("Type the Wi-Fi password to save"),
      password,
    );
    expect(save()).toHaveAccessibleName("Review the change…");
    expect(described(save())).toMatch(
      /If the network name or password is wrong, the NAS cannot join the Wi-Fi network, and this page loses it\./u,
    );
    await user.click(save());
    await screen.findByRole("heading", { name: /^Review the change to/u });
    const table = screen.getByRole("table", { name: "What changes" });
    expect(table).toHaveTextContent("Password: typed again");
    expect(markupOf()).not.toContain(password);
    expect(markupOf()).not.toContain("EXAMPLE-PASSWORD");
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
    expect(callNames()).not.toContain("Network.setWirelessIface");
  });
});

describe("7: a bond on this page's path", () => {
  it("keeps its own ports choosable, and a change to them may cut the page", async () => {
    const { user } = await change(
      "networkLayers",
      "bond",
      "bond0",
      NETWORK_IFACES.bond0,
    );
    await opened();
    const ports = screen.getByRole("group", { name: "Ports in the bond" });
    const enp26s0 = within(ports).getByRole("checkbox", { name: /^enp26s0/u });
    expect(enp26s0).toBeChecked();
    expect(enp26s0).not.toHaveAttribute("aria-disabled");
    expect(save()).toHaveAccessibleName("Save");
    await user.click(enp26s0);
    expect(save()).toHaveAccessibleName("Review the change…");
    expect(described(save())).toMatch(
      /^If this setting is wrong, this page loses the NAS/u,
    );
    expect(screen.queryByText(/^The NAS names it/u)).toBeNull();
  });
});

describe("UI-2: hostile values", () => {
  it("shows notes, names and Wi-Fi names from the NAS as inert text", async () => {
    await change(
      "networkHostile",
      "wifi",
      "wlx00005e005302",
      NETWORK_IFACES.hostileWifi,
    );
    await opened();
    expect(screen.getByRole("textbox", { name: "Network name" })).toHaveValue(
      "<i>שלום</i>‮EXAMPLE-NET-01",
    );
    expect(
      (screen.getByRole("textbox", { name: /^Note/u }) as HTMLInputElement)
        .value,
    ).toContain('<img src=x onerror="alert(1)">');
    expect(document.body.querySelector("img, script, i")).toBeNull();
    expect(markupOf()).not.toContain("<img src=");
    expect(markupOf()).not.toContain("EXAMPLE-PASSWORD");
  });
});
