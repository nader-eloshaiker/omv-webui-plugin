// SPDX-License-Identifier: GPL-3.0-or-later
// The band with network changes pending (phase 5 network design 1.8, 10.4, 13.1) through the whole
// app on MSW: the apply confirmation's check from the server's state and its three escalations, the
// classes this session saved taking the place of 1.8's server-state rules (1.8 as built), the apply
// that waits for the NAS instead of failing at the first lost read, the recovery card when it does
// not come back, the moved card without a link (the address came from the NAS, P7), and Undo after
// an interface's settings were removed.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { networkRereads } from "../../hooks/useNetworkReads.ts";
import { sameInterfaces } from "../../network/bandSession.ts";
import {
  recordIfaceRemoved,
  recordNetworkSave,
} from "../../network/networkSession.ts";
import { setApparentPageLocation } from "../../network/pageLocation.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { seenCalls, server } from "../../test/server.ts";

const INFO = CONTRACT_EXAMPLES.systemGetInformation.admin.value;
const ONE_PORT = CONTRACT_EXAMPLES.networkGetInterfaceList.onePort.value;
const TWO_PORTS = CONTRACT_EXAMPLES.networkGetInterfaceList.twoPorts.value;
const PORT = ONE_PORT.data[0];
const NETWORK = {
  "systemd-networkd": "The network",
  hosts: "Hosts",
  avahi: "Zeroconf",
};

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });

interface World {
  dirty: Record<string, string>;
  down: boolean;
  cutOnApply: boolean;
  stored: unknown;
  storedAfterRevert?: unknown;
  rules: string;
}

async function band(world: Partial<World> = {}) {
  const w: World = {
    dirty: { ...NETWORK },
    down: false,
    cutOnApply: false,
    stored: ONE_PORT,
    rules: "none",
    ...world,
  };
  const app = await renderApp({
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
      networkEnumerateDevicesList: "ethernetAndLoopback",
      networkGetGeneralSettings: "noDomain",
      networkGetInterfaceList: () => ok(w.stored),
      iptablesGetRules: () => w.rules as "none",
      configApplyChangesBg: () => {
        if (w.cutOnApply) {
          w.down = true;
        }
        w.dirty = {};
        return "applied";
      },
      configRevertChangesBg: () => {
        w.dirty = {};
        if (w.storedAfterRevert !== undefined) {
          w.stored = w.storedAfterRevert;
        }
        return "reverted";
      },
      execGetOutput: "appliedFinished",
    },
  });
  server.use(
    http.post("*/rpc.php", () => (w.down ? HttpResponse.error() : undefined)),
  );
  setApparentPageLocation({
    protocol: "http:",
    hostname: "192.0.2.10",
    port: "",
  });
  const region = await screen.findByRole("region", { name: "Pending changes" });
  return { ...app, w, region };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function wait(seconds: number) {
  for (let s = 0; s < seconds; s += 2) {
    await advance(2000);
  }
}

async function openApply(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  region: HTMLElement,
) {
  await user.click(
    within(region).getByRole("button", { name: /^Apply \d+ changes?$/u }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: /^Apply \d+ changes?\?$/u,
  });
  await waitFor(() =>
    expect(
      within(dialog).queryByText("Checking what applying does to this page…"),
    ).toBeNull(),
  );
  return dialog;
}

/** This session saved the pending network change itself, as Brief interruption (1.8 as built). */
async function savedHereAsBrief(
  app: Awaited<ReturnType<typeof renderApp>>["app"],
) {
  const stored = await networkRereads(app.queryClient).stored();
  recordNetworkSave({
    pendingBefore: [],
    interfacesBefore: stored,
    interfacesAfter: stored,
    change: {
      devicename: "enp2s0",
      impact: { class: "brief", findings: [{ class: "brief" }] },
    },
    same: sameInterfaces,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("1.8: the apply confirmation's network check", () => {
  it("a stored automatic method on this page's interface, not saved here: the typed confirmation", async () => {
    const { user, region } = await band();
    const dialog = await openApply(user, region);
    expect(dialog).toHaveTextContent(
      "enp2s0: if its settings are wrong, this page loses the NAS.",
    );
    expect(
      within(dialog).getByRole("heading", { name: "Before you apply" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Copy the current settings" }),
    ).toBeVisible();
    const apply = within(dialog).getByRole("button", {
      name: "Apply 3 changes",
    });
    expect(apply).toHaveAttribute("aria-disabled", "true");
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type the interface's name to confirm: enp2s0",
      }),
      "enp2s0",
    );
    expect(apply).not.toHaveAttribute("aria-disabled", "true");
    // No link to an address from the NAS anywhere in it (P7, UI-3).
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("the same pending change saved in this session as Brief: the ordinary confirmation with its line", async () => {
    const { user, region, app } = await band();
    await savedHereAsBrief(app);
    const dialog = await openApply(user, region);
    expect(dialog).toHaveTextContent(
      "Network: this page may stop responding for a few seconds.",
    );
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Apply 3 changes" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("someone changed the interfaces since this session's save: back to the server-state rules", async () => {
    const { user, region, app, w } = await band();
    await savedHereAsBrief(app);
    w.stored = { total: 1, data: [{ ...PORT, comment: "theirs" }] };
    const dialog = await openApply(user, region);
    expect(
      within(dialog).getByRole("textbox", { name: /to confirm/u }),
    ).toBeVisible();
  });

  it("this page's interface left without settings: Apply unavailable, the reason, a link, and Undo", async () => {
    const { user, region } = await band({ stored: { total: 0, data: [] } });
    const dialog = await openApply(user, region);
    expect(dialog).toHaveTextContent(
      "The pending settings leave enp2s0, which this page uses, without an address.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Apply 3 changes" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(dialog).getByRole("link", { name: "Open enp2s0" }),
    ).toHaveAttribute("href", "/ui/network/interfaces");
    await user.click(
      within(dialog).getByRole("button", { name: "Undo 3 changes" }),
    );
    expect(
      await screen.findByRole("alertdialog", { name: "Undo 3 changes?" }),
    ).toBeVisible();
  });

  it("pending firewall rules that block this page for every computer: Apply unavailable", async () => {
    const { user, region } = await band({
      dirty: { iptables: "Firewall" },
      rules: "blocksPage",
    });
    const dialog = await openApply(user, region);
    expect(dialog).toHaveTextContent(
      "The pending firewall rules would block this page for every computer.",
    );
    expect(
      within(dialog).getByRole("link", { name: "Change the firewall rules" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Apply 1 change" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("13.1: the band's apply waits for the NAS", () => {
  it("a lost read while the network restarts is not a failure: it waits, then says it is connected again", async () => {
    const { user, region, app, w } = await band({ cutOnApply: true });
    await savedHereAsBrief(app);
    const dialog = await openApply(user, region);
    await user.click(
      within(dialog).getByRole("button", { name: "Apply 3 changes" }),
    );
    expect(
      await screen.findByRole("button", { name: "Stop waiting" }),
    ).toBeVisible();
    await wait(8);
    expect(screen.queryByText(/Applying the changes failed/u)).toBeNull();
    w.down = false;
    await wait(4);
    expect(
      await screen.findByText(
        "The changes are applied. This page reaches the NAS again.",
      ),
    ).toBeVisible();
    // The waiting reads were background ones (UI-14).
    expect(
      seenCalls.some((c) => c.call === "System.getInformation" && c.background),
    ).toBe(true);
  });

  it("a NAS that does not come back within 60 seconds: the recovery card, without links", async () => {
    const { user, region, app } = await band({ cutOnApply: true });
    await savedHereAsBrief(app);
    const dialog = await openApply(user, region);
    await user.click(
      within(dialog).getByRole("button", { name: "Apply 3 changes" }),
    );
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(62);
    const card = await screen.findByRole("region", {
      name: "This page cannot reach the NAS since the change.",
    });
    expect(within(card).getByText("omv-firstaid")).toBeVisible();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  it("a stored new fixed address: the moved card, with the address as text and no link (P7)", async () => {
    const moved = {
      ...PORT,
      method: "static",
      address: "192.0.2.20",
      netmask: "255.255.255.0",
    };
    const { user, region } = await band({
      cutOnApply: true,
      stored: { total: 1, data: [moved] },
    });
    const dialog = await openApply(user, region);
    expect(dialog).toHaveTextContent(
      "enp2s0: this page stops working at 192.0.2.10; the NAS will be at 192.0.2.20.",
    );
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type the new address to confirm it: 192.0.2.20",
      }),
      "192.0.2.20",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Apply 3 changes" }),
    );
    await screen.findByRole("button", { name: "Stop waiting" });
    await wait(32);
    expect(await screen.findByText(/^The NAS is now at/u)).toHaveTextContent(
      "The NAS is now at http://192.0.2.20/ui/.",
    );
    expect(
      screen.queryByRole("link", { name: /Open the NAS at its new address/u }),
    ).toBeNull();
  });
});

describe("10.4: Undo after an interface's settings were removed", () => {
  it("a removal this session saved: the Undo confirmation says so, then the queued jobs and the network are applied", async () => {
    recordIfaceRemoved("enp3s0");
    const { user, region } = await band({
      dirty: { ...NETWORK, task: "Queued jobs" },
      storedAfterRevert: TWO_PORTS,
    });
    await user.click(
      within(region).getByRole("button", { name: "Undo 4 changes" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Undo 4 changes?",
    });
    expect(dialog).toHaveTextContent(
      /The NAS also queued a job to switch\s*enp3s0\s*off/u,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Undo 4 changes" }),
    );
    await waitFor(() =>
      expect(
        seenCalls.find((c) => c.call === "Config.applyChangesBg")?.params,
      ).toEqual({
        modules: ["task", "systemd-networkd"],
        force: true,
      }),
    );
    expect(
      seenCalls.map((c) => c.call).indexOf("Config.revertChangesBg"),
    ).toBeLessThan(
      seenCalls.map((c) => c.call).indexOf("Config.applyChangesBg"),
    );
  });

  it("a removal it did not see: it compares the interfaces before and after, and offers the same apply", async () => {
    const { user, region } = await band({
      dirty: { ...NETWORK, task: "Queued jobs" },
      storedAfterRevert: TWO_PORTS,
    });
    await user.click(
      within(region).getByRole("button", { name: "Undo 4 changes" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Undo 4 changes?",
    });
    expect(dialog).not.toHaveTextContent(/queued a job/u);
    await user.click(
      within(dialog).getByRole("button", { name: "Undo 4 changes" }),
    );
    // The interface's name is its own element: the sentence's text is matched around it.
    expect(
      await screen.findByText(/are back\. The NAS still has a job/u),
    ).toHaveTextContent(/^The settings of enp3s0 are back\./u);
    expect(seenCalls.some((c) => c.call === "Config.applyChangesBg")).toBe(
      false,
    );
    await user.click(screen.getByRole("button", { name: "Apply them now" }));
    await waitFor(() =>
      expect(
        seenCalls.find((c) => c.call === "Config.applyChangesBg")?.params,
      ).toEqual({
        modules: ["task", "systemd-networkd"],
        force: true,
      }),
    );
  });
});
