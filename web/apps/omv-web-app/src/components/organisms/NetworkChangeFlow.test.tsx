// SPDX-License-Identifier: GPL-3.0-or-later
// The change flow (phase 5 network design 1.4 to 1.7) through the whole app on MSW, with the
// contract's examples: the pre-flight, the summary and its typed confirmation (Enter never confirms,
// Cancel has focus), the refusal when the object changed since the summary, the run, the reconnect
// watch's outcomes on fake time (connected again, still at the old address, the moved card with a link
// only for what was typed here, the recovery card, Stop waiting, a 401), Put back and its
// availability, and no Wi-Fi password anywhere in the caches after a Wi-Fi Put back (UI-6).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { NetworkInterface } from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { UiProvider } from "@omv-webui/react-ui-components";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider } from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "../../app.ts";
import { useNetworkWrites } from "../../hooks/useNetworkWrites.ts";
import {
  wifiPutBackRequest,
  type Confirmation,
} from "../../network/changeFlow.ts";
import { toIfaceSettings, type IfaceSettings } from "../../network/dto.ts";
import { restoreChanged } from "../../network/ifaceModel.ts";
import type { Impact } from "../../network/impact.ts";
import { setApparentPageLocation } from "../../network/pageLocation.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls, server } from "../../test/server.ts";
import { NetworkChangeFlow, type NetworkChange } from "./NetworkChangeFlow.tsx";

const INFO = CONTRACT_EXAMPLES.systemGetInformation.admin.value;
const NETWORKD = {
  "systemd-networkd": "The network",
  hosts: "Hosts",
  avahi: "Zeroconf",
  halt: "Halt",
  issue: "Issue",
};
// The examples as the transport hands them on: the Wi-Fi password as whether it is set.
const BEFORE = toIfaceSettings({
  ...CONTRACT_EXAMPLES.networkGetInterface.dhcp.value,
  slaves: [],
  wpapsk: false,
} as NetworkInterface) as IfaceSettings;
const BEFORE_WIFI = toIfaceSettings({
  ...CONTRACT_EXAMPLES.networkGetInterface.wifi.value,
  slaves: [],
  wpapsk: true,
} as NetworkInterface) as IfaceSettings;
const WIFI = BEFORE_WIFI.devicename;
const TYPED_PASSWORD = "typed-Wifi-Pw7";
const PUT_BACK_PASSWORD = "putback-Pw9q";

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });

type Story = "moved" | "same" | "automatic" | "wifi" | "hostile";

const IMPACTS: Record<Story, Impact> = {
  moved: {
    class: "moves",
    findings: [
      {
        class: "moves",
        effect: "netChange.effect.newAddress",
        family: 4,
        old: "192.0.2.10",
        new: "192.0.2.20",
      },
    ],
  },
  same: {
    class: "mayCut",
    findings: [{ class: "mayCut", effect: "netChange.effect.gateway" }],
  },
  automatic: {
    class: "mayCut",
    findings: [{ class: "mayCut", effect: "netChange.effect.automatic" }],
  },
  wifi: {
    class: "mayCut",
    findings: [{ class: "mayCut", effect: "netChange.effect.wifi" }],
  },
  hostile: {
    class: "mayCut",
    findings: [{ class: "mayCut", effect: "netChange.effect.gateway" }],
  },
};

const HOSTILE = '<img src=x onerror="alert(1)">‮eth';

function Harness({ story }: { story: Story }) {
  const writes = useNetworkWrites();
  const [where, setWhere] = useState<"flow" | "back" | "cancel" | "done">(
    "flow",
  );
  const [change] = useState<NetworkChange>(() => {
    const impact = IMPACTS[story];
    if (story === "wifi") {
      const request = wifiPutBackRequest(
        BEFORE_WIFI,
        BEFORE_WIFI.uuid,
        TYPED_PASSWORD,
      );
      if (request === null) {
        throw new Error("no request");
      }
      return {
        object: { kind: "iface", devicename: WIFI, type: "wifi" },
        action: "ifaceChanged",
        rows: [],
        impact,
        note: `Interface: ${WIFI}`,
        confirmation: { code: "netChange.typeIface", value: WIFI },
        write: writes.iface({
          before: BEFORE_WIFI,
          write: { type: "wifi", request: { ...request, band: "5GHz" } },
          impact,
        }),
        wifi: true,
        hostname: "nas",
      };
    }
    const base = restoreChanged(BEFORE);
    if (base.type !== "ethernet") {
      throw new Error("not a port");
    }
    const request =
      story === "moved"
        ? {
            ...base.request,
            method: "static" as const,
            address: "192.0.2.20",
            netmask: "255.255.255.0",
            gateway: "192.0.2.1",
            dnsnameservers: "192.0.2.1",
          }
        : story === "automatic"
          ? { ...base.request, altmacaddress: "00:00:5e:00:53:99" }
          : { ...base.request, comment: "router" };
    const confirmation: Confirmation =
      story === "moved"
        ? { code: "netChange.typeAddress", value: "192.0.2.20" }
        : { code: "netChange.typeIface", value: "enp2s0" };
    return {
      object: {
        kind: "iface",
        devicename: story === "hostile" ? HOSTILE : "enp2s0",
        type: "ethernet",
      },
      action: "ifaceChanged",
      rows: [
        {
          id: "ipv4",
          label: "IPv4 address",
          now: "192.0.2.10/24",
          after: story === "moved" ? "192.0.2.20/24" : "192.0.2.10/24",
          changed: story === "moved",
        },
      ],
      impact,
      others:
        story === "hostile"
          ? [{ id: "x", text: HOSTILE }]
          : [
              {
                id: "a",
                text: "Other computers that use 192.0.2.10 must use 192.0.2.20.",
              },
            ],
      note: "Interface: enp2s0\nIPv4: Automatic (DHCP)",
      confirmation,
      write: writes.iface({
        before: BEFORE,
        write: { type: "ethernet", request },
        impact,
      }),
      hostname: "nas",
    };
  });
  if (where !== "flow") {
    return <p>left the flow: {where}</p>;
  }
  return (
    <NetworkChangeFlow
      change={change}
      onBack={() => setWhere("back")}
      onCancel={() => setWhere("cancel")}
      onDone={() => setWhere("done")}
    />
  );
}

function Providers({ app, children }: { app: App; children: ReactNode }) {
  return (
    <UiProvider>
      <QueryClientProvider client={app.queryClient}>
        <RouterContextProvider router={app.router}>
          {children}
        </RouterContextProvider>
      </QueryClientProvider>
    </UiProvider>
  );
}

interface World {
  dirty: Record<string, string>;
  /** No reply to anything: the network is restarting, or the NAS moved. */
  down: boolean;
  /** Go down as soon as the apply starts. */
  cutOnApply: boolean;
  /** Answer 401 instead of going back up. */
  unauthorized: boolean;
  /** getInterface reads after the summary differ (another administrator). */
  changedSince: boolean;
  /** The interface as stored: getInterface and getInterfaceList read it, the set methods write it. */
  iface: Record<string, unknown>;
}

async function openFlow(
  story: Story,
  world: Partial<World> = {},
): Promise<{
  app: App;
  user: Awaited<ReturnType<typeof renderApp>>["user"];
  w: World;
}> {
  const w: World = {
    dirty: {},
    down: false,
    cutOnApply: false,
    unauthorized: false,
    changedSince: false,
    iface:
      story === "wifi"
        ? { ...CONTRACT_EXAMPLES.networkGetInterface.wifi.value }
        : { ...CONTRACT_EXAMPLES.networkGetInterface.dhcp.value },
    ...world,
  };
  // What OMV stores from a set request: the fields sent, the password as a stored string.
  const store = (params: unknown) => {
    const { wpapsk: _sent, ...fields } = params as Record<string, unknown>;
    w.iface = { ...w.iface, ...fields, wpapsk: story === "wifi" ? "x" : "" };
  };
  const { app, user } = await renderApp({
    signedIn: true,
    path: "/account/settings",
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    answers: {
      systemGetInformation: () =>
        ok({
          ...INFO,
          configDirty: Object.keys(w.dirty).length > 0,
          dirtyModules: w.dirty,
        }),
      networkEnumerateDevicesList:
        story === "wifi" ? "wifi" : "ethernetAndLoopback",
      networkGetGeneralSettings: "noDomain",
      networkGetInterfaceList: () =>
        ok({
          total: 1,
          data: [{ ...w.iface, _used: false, _readonly: false }],
        }),
      networkGetInterface: () =>
        ok(w.changedSince ? { ...w.iface, comment: "theirs" } : w.iface),
      networkSetEthernetIface: ({ params }) => {
        store(params);
        w.dirty = { ...NETWORKD };
        return "changed";
      },
      networkSetWirelessIface: ({ params }) => {
        store(params);
        w.dirty = { ...NETWORKD };
        return "created";
      },
      configApplyChangesBg: () => {
        if (w.cutOnApply) {
          w.down = true;
        }
        w.dirty = {};
        return "applied";
      },
      configRevertChangesBg: () => {
        w.dirty = {};
        return "reverted";
      },
      execGetOutput: "appliedFinished",
    },
  });
  server.use(
    http.post("*/rpc.php", () => {
      if (w.down) {
        return w.unauthorized
          ? HttpResponse.json(
              {
                response: null,
                error: {
                  code: 5001,
                  message: "Session not authenticated.",
                  trace: "",
                },
              },
              { status: 401 },
            )
          : HttpResponse.error();
      }
      return undefined;
    }),
  );
  setApparentPageLocation({
    protocol: "http:",
    hostname: "192.0.2.10",
    port: "",
  });
  render(
    <Providers app={app}>
      <Harness story={story} />
    </Providers>,
  );
  return { app, user, w };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Wait `seconds` of the watch, two at a time (its poll). */
async function wait(seconds: number) {
  for (let s = 0; s < seconds; s += 2) {
    await advance(2000);
  }
}

async function summary(story: Story, world: Partial<World> = {}) {
  const opened = await openFlow(story, world);
  const heading = await screen.findByRole("heading", {
    name: /^Review the change to/u,
  });
  return { ...opened, heading };
}

const saveAndApply = () =>
  screen.getByRole("button", { name: "Save and apply" });

async function confirmAndRun(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  value: string,
) {
  await user.type(screen.getByRole("textbox", { name: /to confirm/u }), value);
  await user.click(saveAndApply());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("1.4 step 1: the pre-flight", () => {
  it("refuses to start while other changes are pending, naming them, with Apply and Undo", async () => {
    await openFlow("moved", { dirty: { ssh: "SSH" } });
    expect(
      await screen.findByText(/Other changes are waiting to be applied:/u),
    ).toHaveTextContent("SSH");
    expect(
      screen.getByRole("button", { name: "Apply them now" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo them" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /^Review the change/u }),
    ).toBeNull();
  });
});

describe("1.4 step 2: the summary and its typed confirmation", () => {
  it("shows the connection, what changes, what it does, and starts with Cancel focused", async () => {
    await summary("moved");
    expect(screen.getByText(/This page reaches the NAS at/u)).toHaveTextContent(
      "This page reaches the NAS at 192.0.2.10 through enp2s0.",
    );
    expect(screen.getByRole("table", { name: "What changes" })).toBeVisible();
    expect(
      screen.getByText(/Open the NAS at its new address afterwards/u),
    ).toHaveTextContent("http://192.0.2.20/ui/");
    expect(
      screen.getByRole("heading", { name: "What it does to other computers" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy the current settings" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Nothing puts the old settings back by itself/u),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("keeps Save and apply unavailable until the new address is typed, and Enter never confirms", async () => {
    const { user } = await summary("moved");
    const field = screen.getByRole("textbox", {
      name: "Type the new address to confirm it: 192.0.2.20",
    });
    await user.type(field, "192.0.2.200");
    expect(saveAndApply()).toHaveAttribute("aria-disabled", "true");
    await user.clear(field);
    await user.type(field, "192.0.2.20{Enter}");
    await advance(500);
    expect(callNames()).not.toContain("Network.setEthernetIface");
    expect(saveAndApply()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("Back and Cancel leave without saving", async () => {
    const { user } = await summary("moved");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("left the flow: back")).toBeVisible();
    expect(callNames()).not.toContain("Network.setEthernetIface");
  });

  it("renders a hostile interface name and line as text", async () => {
    const { heading } = await summary("hostile");
    expect(heading.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(markupOf()).not.toContain("<img src=");
  });
});

describe("1.4 step 3: the run", () => {
  it("refuses when the interface changed since the summary, and saves nothing", async () => {
    const { user, w } = await summary("moved");
    w.changedSince = true;
    await confirmAndRun(user, "192.0.2.20");
    expect(
      await screen.findByText(/was changed since you opened it/u),
    ).toHaveTextContent(
      "enp2s0 was changed since you opened it. Review the change again.",
    );
    expect(callNames()).not.toContain("Network.setEthernetIface");
    expect(callNames()).not.toContain("Config.applyChangesBg");
  });

  it("saves, applies exactly this change's modules, and reaches the NAS again", async () => {
    const { user } = await summary("same");
    await confirmAndRun(user, "enp2s0");
    expect(await screen.findByText(/^Connected again\./u)).toHaveTextContent(
      "Connected again. This page reaches the NAS at 192.0.2.10 through enp2s0.",
    );
    const apply = seenCalls.find((c) => c.call === "Config.applyChangesBg");
    expect(apply?.params).toEqual({
      modules: ["systemd-networkd", "hosts", "avahi", "halt", "issue"],
      force: false,
    });
    expect(
      screen.getByRole("button", { name: "Keep the new settings" }),
    ).toBeVisible();
  });
});

describe("1.5: the reconnect watch", () => {
  it("does not call a lost connection a failure: it waits, then says it is connected again", async () => {
    const { user, w } = await summary("same", { cutOnApply: true });
    await confirmAndRun(user, "enp2s0");
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(8);
    // Elapsed time, counting up (never a countdown).
    expect(
      screen.getAllByText(/^Waiting for the NAS to answer…/u).at(-1),
    ).toHaveTextContent(/^Waiting for the NAS to answer… \d+ seconds$/u);
    // Background reads only while waiting (UI-14).
    const polls = seenCalls.filter(
      (c) => c.call === "System.getInformation" && c.background,
    );
    expect(polls.length).toBeGreaterThan(0);
    w.down = false;
    await wait(4);
    expect(await screen.findByText(/^Connected again\./u)).toBeVisible();
    expect(screen.queryByText("Applying the change failed")).toBeNull();
  });

  it("a move: the moved card with the new address as text and a link, since it was typed here (P7)", async () => {
    const { user } = await summary("moved", { cutOnApply: true });
    await confirmAndRun(user, "192.0.2.20");
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(32);
    expect(await screen.findByText(/^The NAS is now at/u)).toHaveTextContent(
      "The NAS is now at http://192.0.2.20/ui/.",
    );
    const links = screen.getAllByRole("link", {
      name: /Open the NAS at its new address/u,
    });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "http://192.0.2.20/ui/");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
    expect(screen.queryByRole("button", { name: /Put back/u })).toBeNull();
  });

  it("a move that still answers at the old address says so", async () => {
    const { user, w } = await summary("moved", { cutOnApply: true });
    await confirmAndRun(user, "192.0.2.20");
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(4);
    w.down = false;
    await wait(4);
    expect(
      await screen.findByText(/^The NAS still answers at/u),
    ).toHaveTextContent(
      "The NAS still answers at 192.0.2.10. The change may not have been applied.",
    );
  });

  it("an automatic address that never answers: the recovery card, with the .local address as text only", async () => {
    const { user } = await summary("automatic", { cutOnApply: true });
    await confirmAndRun(user, "enp2s0");
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(60);
    expect(
      screen.queryByRole("heading", {
        name: /may have been given a new address/u,
      }),
    ).toBeNull();
    await wait(62);
    const card = await screen.findByRole("region", {
      name: "The NAS may have been given a new address by your router, and this page cannot know it.",
    });
    expect(
      within(card).getByText(/router's list of connected devices/u),
    ).toHaveTextContent("http://nas.local/ui/");
    expect(within(card).queryByRole("link")).toBeNull();
    expect(within(card).getByText("omv-firstaid")).toBeVisible();
  });

  it("Stop waiting shows the recovery card at once", async () => {
    const { user } = await summary("same", { cutOnApply: true });
    await confirmAndRun(user, "enp2s0");
    await screen.findByRole("button", { name: "Stop waiting" });
    await user.click(screen.getByRole("button", { name: "Stop waiting" }));
    expect(
      await screen.findByRole("region", {
        name: "This page cannot reach the NAS since the change.",
      }),
    ).toBeVisible();
  });

  it("a NAS that never answers within 60 seconds: the recovery card, variant lost", async () => {
    const { user } = await summary("same", { cutOnApply: true });
    await confirmAndRun(user, "enp2s0");
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(62);
    expect(
      await screen.findByRole("region", {
        name: "This page cannot reach the NAS since the change.",
      }),
    ).toBeVisible();
  });

  it("a 401 when the NAS answers: the session ends for the whole interface, which shows sign-in", async () => {
    const { user, w, app } = await summary("same", { cutOnApply: true });
    await confirmAndRun(user, "enp2s0");
    await screen.findByRole("button", { name: "Stop waiting" });
    w.unauthorized = true;
    await wait(4);
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe("/sign-in"),
    );
  });
});

describe("1.7: Keep the new settings, or put back how it was", () => {
  it("Keep sends nothing and ends the flow", async () => {
    const { user } = await summary("same");
    await confirmAndRun(user, "enp2s0");
    await screen.findByText(/^Connected again\./u);
    const before = seenCalls.length;
    await user.click(
      screen.getByRole("button", { name: "Keep the new settings" }),
    );
    expect(screen.getByText("left the flow: done")).toBeVisible();
    expect(
      seenCalls
        .slice(before)
        .filter(
          (c) => !c.call.startsWith("System.") && c.call !== "Config.isDirty",
        ),
    ).toEqual([]);
  });

  it("Put back writes the settings as they were and applies them again", async () => {
    const { user } = await summary("same");
    await confirmAndRun(user, "enp2s0");
    await screen.findByText(/^Connected again\./u);
    await user.click(
      screen.getByRole("button", { name: "Put back how it was…" }),
    );
    // happy-dom gives the name's code element a space before the "?" (as WipeSection.test notes).
    const dialog = await screen.findByRole("alertdialog", {
      name: (name) =>
        name.replace(/\s+(?=\?)/gu, "") ===
        "Put back the previous settings of enp2s0?",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );
    await user.click(within(dialog).getByRole("button", { name: "Put back" }));
    await waitFor(() =>
      expect(
        seenCalls.filter((c) => c.call === "Network.setEthernetIface"),
      ).toHaveLength(2),
    );
    const putBack = seenCalls.filter(
      (c) => c.call === "Network.setEthernetIface",
    )[1];
    expect(putBack?.params).toMatchObject({ uuid: BEFORE.uuid, comment: "" });
    expect(await screen.findByRole("button", { name: "Close" })).toBeVisible();
  });

  it("Put back is unavailable, with the reason, when other changes became pending", async () => {
    const { user, w } = await summary("same");
    await confirmAndRun(user, "enp2s0");
    await screen.findByText(/^Connected again\./u);
    w.dirty = { ssh: "SSH" };
    await user.click(
      screen.getByRole("button", { name: "Put back how it was…" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Put back",
      }),
    );
    expect(
      await screen.findByText(/Other changes are waiting to be applied/u),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Put back how it was…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      seenCalls.filter((c) => c.call === "Network.setEthernetIface"),
    ).toHaveLength(1);
  });

  it("a Wi-Fi Put back asks for the password, and no password stays in any cache or the page (UI-6)", async () => {
    const { user, app } = await summary("wifi");
    await confirmAndRun(user, WIFI);
    // A Wi-Fi change may give a new automatic address: the NAS answering says it kept its address.
    expect(
      await screen.findByText(/^The NAS kept the address/u),
    ).toHaveTextContent("The NAS kept the address 192.0.2.10.");
    await user.click(
      screen.getByRole("button", { name: "Put back how it was…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    const putBack = within(dialog).getByRole("button", { name: "Put back" });
    expect(putBack).toHaveAttribute("aria-disabled", "true");
    await user.type(
      within(dialog).getByLabelText("Wi-Fi password"),
      PUT_BACK_PASSWORD,
    );
    await user.click(putBack);
    await waitFor(() =>
      expect(
        seenCalls.filter((c) => c.call === "Network.setWirelessIface"),
      ).toHaveLength(2),
    );
    expect(
      seenCalls.filter((c) => c.call === "Network.setWirelessIface")[1]?.params,
    ).toMatchObject({
      wpapsk: PUT_BACK_PASSWORD,
      band: "auto",
    });
    await screen.findByRole("button", { name: "Close" });
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
    for (const secret of [
      TYPED_PASSWORD,
      PUT_BACK_PASSWORD,
      "EXAMPLE-PASSWORD",
    ]) {
      expect(caches).not.toContain(secret);
      expect(markupOf()).not.toContain(secret);
    }
  });
});
