// SPDX-License-Identifier: GPL-3.0-or-later
// The shell through the whole app on MSW serving the contract's examples: the menu by role, pages
// that only the classic interface has, the pending-changes band (apply and undo as tasks, a failed
// apply), the tasks menu, the background poll (UI-14), the HTTP notice (UI-12), not-found, focus
// after navigation, and no state-changing call on load (UI-4).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { installDensity } from "../../services/density/index.ts";
import { installTheme } from "../../services/theme/index.ts";
import { clearStorage, storageSnapshot } from "../../stores/storageSnapshot.ts";
import { useThemeStore } from "../../stores/useThemeStore.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const nav = () =>
  screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

/** Opens a folded group of the side navigation (only the current page's group starts open). */
function openGroup(name: string) {
  const head = within(nav()).getByRole("button", { name });
  if (head.getAttribute("aria-expanded") === "false") {
    fireEvent.click(head);
  }
}

const READS = new Set([
  "System.getInformation",
  "UserMgmt.getUserByContext",
  "WebGui.getAutoLogoutSettings",
  "Config.isDirty",
  // The shell's combined read: the interface counters for the live samples (live/useLive.ts).
  "Network.enumerateDevicesList",
  // The menu's one probe of the RAID plugin (RAID design 0.10): it reads no array member.
  "MdMgmt.getCandidates",
  // The menu's one probe of the ZFS plugin (ZFS design 0.11): it runs no command.
  "Zfs.listCompressionTypes",
]);

async function shell(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ signedIn: true, ...options });
  await screen.findByRole("banner");
  return app;
}

describe("the side navigation", () => {
  it("gives an administrator OMV's groups in the stock order, and the add-ons entry", async () => {
    await shell();
    const groups = within(nav())
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-labelledby"))
      .map((id) => document.getElementById(id ?? "")?.textContent);
    expect(groups).toEqual([
      "System",
      "Network",
      "Storage",
      "Services",
      "Users",
      "Diagnostics",
      "Account",
    ]);
    expect(
      within(nav()).getByRole("link", { name: /Add-ons/ }),
    ).toBeInTheDocument();
  });

  it("gives a normal user the dashboard and their account only, as the stock interface does", async () => {
    await shell({ scenario: "user" });
    const links = within(nav())
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(links).toEqual(["Dashboard", "Your account"]);
  });

  it("links the pages built here to their own routes, without the classic mark", async () => {
    const { user } = await shell();
    for (const [group, name, path] of [
      ["Services", "SSH", "/ui/services/ssh"],
      ["Storage", "Shared folders", "/ui/storage/shared-folders"],
      ["Account", "Your account", "/ui/account/settings"],
    ] as const) {
      openGroup(group);
      const link = within(nav()).getByRole("link", { name });
      expect(link).toHaveAttribute("href", path);
      await user.click(link);
      await waitFor(() =>
        expect(within(nav()).getByRole("link", { name })).toHaveAttribute(
          "aria-current",
          "page",
        ),
      );
    }
    // A page still in the classic interface keeps its mark.
    openGroup("System");
    openGroup("Services");
    expect(
      within(nav()).getByRole("link", { name: /^Scheduled tasks/ }),
    ).toHaveTextContent("Classic");
    expect(
      within(nav()).getByRole("link", { name: "NFS" }),
    ).not.toHaveTextContent("Classic");
    expect(
      within(nav()).getByRole("link", { name: "SSH" }),
    ).not.toHaveTextContent("Classic");
  });

  it("marks Your account as current at the password address too", async () => {
    await shell({ scenario: "user", path: "/account/password" });
    await screen.findByRole("heading", { name: "Your account" });
    expect(
      within(nav()).getByRole("link", { name: "Your account" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("marks the current page", async () => {
    await shell();
    expect(
      within(nav()).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("a page only the classic interface has", () => {
  it("links to the same page there at a fixed address, calls nothing, and takes focus to its title", async () => {
    const { user } = await shell();
    await screen.findByRole("heading", { name: "Dashboard" });
    const before = seenCalls.length;
    openGroup("System");
    await user.click(
      within(nav()).getByRole("link", { name: /^Scheduled tasks/ }),
    );
    const title = await screen.findByRole("heading", {
      name: "Scheduled tasks",
    });
    await waitFor(() => expect(title).toHaveFocus());
    expect(document.title).toBe("Scheduled tasks – openmediavault");
    expect(window.location.pathname).toBe("/ui/system/cron");
    // The classic interface routes by hash: its pages are at /#/<group>/<item>.
    const link = screen.getByRole("link", {
      name: "Open Scheduled tasks in the classic interface (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "/#/system/cron");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(seenCalls.slice(before)).toEqual([]);
  });

  it("tells a normal user who reaches an administrator's page by its address that it is not for them", async () => {
    await shell({ scenario: "user", path: "/services/nfs" });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /classic interface/ }),
    ).toBeNull();
  });
});

describe("not found", () => {
  it.each(["/services/telnet", "/nothing/here/at/all", "/constructor"])(
    "shows %s as not found, inside the shell",
    async (path) => {
      await shell({ path });
      expect(
        await screen.findByRole("heading", { name: "Page not found" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("banner")).toBeInTheDocument();
    },
  );

  it("sends a visitor without a session to sign-in, whatever the address", async () => {
    await renderApp({ path: "/nothing/here" });
    expect(
      await screen.findByRole("heading", { name: "Sign in" }),
    ).toBeInTheDocument();
  });
});

describe("the RAID menu item (RAID design 0.10, D1)", () => {
  const storageItems = () => {
    openGroup("Storage");
    const group = within(nav())
      .getAllByRole("group")
      .find(
        (g) =>
          document.getElementById(g.getAttribute("aria-labelledby") ?? "")
            ?.textContent === "Storage",
      );
    return within(group as HTMLElement)
      .getAllByRole("link")
      .map((l) => l.textContent);
  };

  it("appears between Disk health and File systems once the plugin is known to be installed", async () => {
    await shell({ scenario: "raidMirror" });
    await waitFor(() => expect(storageItems()).toContain("RAID"));
    const items = storageItems();
    expect(items.indexOf("RAID")).toBe(items.indexOf("File systems") - 1);
    // Decided by getCandidates, which reads no array member; never by enumerateDevices.
    expect(callNames()).toContain("MdMgmt.getCandidates");
    expect(callNames()).not.toContain("MdMgmt.enumerateDevices");
  });

  it("is not shown without the plugin, and nothing else asks about RAID", async () => {
    await shell({ scenario: "raidNoPlugin" });
    await waitFor(() =>
      expect(seenCalls.some((c) => c.call === "MdMgmt.getCandidates")).toBe(
        true,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(storageItems()).not.toContain("RAID");
    expect(new Set(callNames().filter((c) => c.startsWith("MdMgmt.")))).toEqual(
      new Set(["MdMgmt.getCandidates"]),
    );
  });

  it("is not shown, and RAID is never asked about, for a normal user", async () => {
    await shell({ scenario: "user" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callNames().filter((c) => c.startsWith("MdMgmt."))).toEqual([]);
  });
});

describe("loading a page", () => {
  it("sends no state-changing call (UI-4)", async () => {
    await shell({ scenario: "pendingChanges", path: "/system/workbench" });
    await screen.findByRole("region", { name: "Pending changes" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callNames().filter((c) => !READS.has(c))).toEqual([]);
  });
});

describe("the unencrypted-connection notice (UI-12)", () => {
  it("shows on http: and points an administrator to the HTTPS setting at a fixed address", async () => {
    await shell();
    const notice = await screen.findByRole("region", {
      name: "Connection notice",
    });
    expect(notice).toHaveTextContent("This connection is not encrypted.");
    expect(
      within(notice).getByRole("link", {
        name: "Use a secure connection (HTTPS) (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/workbench/settings");
  });

  it("tells a normal user who can change it", async () => {
    await shell({ scenario: "user" });
    const notice = await screen.findByRole("region", {
      name: "Connection notice",
    });
    expect(notice).toHaveTextContent("Ask an administrator to turn on HTTPS.");
    expect(within(notice).queryByRole("link")).toBeNull();
  });
});

describe("the pending-changes band", () => {
  it("says what is pending, in plain words, and nothing for a normal user", async () => {
    await shell({ scenario: "pendingChanges" });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    expect(band).toHaveTextContent(
      "2 changes waiting to be applied: Network discovery (Zeroconf), SSH",
    );
    expect(
      screen.getByRole("button", { name: "2 pending changes" }),
    ).toBeInTheDocument();
  });

  it("shows a module it does not know as itself, and warns when applying may cut the connection", async () => {
    const info = CONTRACT_EXAMPLES.systemGetInformation.adminPendingChanges
      .value as Record<string, unknown>;
    const { user } = await shell({
      answers: {
        systemGetInformation: {
          status: 200,
          value: {
            ...info,
            dirtyModules: { "systemd-networkd": "x", "zfs-plugin": "y" },
          },
        },
      },
    });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    expect(within(band).getByText("zfs-plugin").tagName).toBe("CODE");
    await user.click(
      within(band).getByRole("button", { name: "Apply 2 changes" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Apply 2 changes?",
    });
    expect(dialog).toHaveTextContent("Network");
    // The network has its own check now (phase 5 network design 1.8): at localhost the page cannot
    // tell which interface it uses, so applying the network may cut it, with the typed confirmation.
    expect(
      await within(dialog).findByText(
        "If this setting is wrong, this page loses the NAS, and you need another way in to put it right.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("textbox", { name: "Type apply to confirm" }),
    ).toBeVisible();
    expect(dialog).not.toHaveTextContent(
      "this page may lose its connection while they restart",
    );
  });

  it("applies as a task after confirming, then clears, and the result stays in the tasks menu", async () => {
    const { user } = await shell({ scenario: "pendingChanges" });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    await user.click(
      within(band).getByRole("button", { name: "Apply 2 changes" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Apply 2 changes?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(dialog).toHaveTextContent("Network discovery (Zeroconf)");
    expect(dialog).not.toHaveTextContent("lose its connection");
    expect(callNames()).not.toContain("Config.applyChangesBg");
    await user.click(
      within(dialog).getByRole("button", { name: "Apply 2 changes" }),
    );

    // It says so, with the line full, for a moment, then closes (foundation 7.2).
    expect(
      await within(band).findByText(
        "Applied. The services now use the new settings.",
        undefined,
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          screen.queryByRole("region", { name: "Pending changes" }),
        ).not.toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(callNames()).toContain("Config.applyChangesBg");
    // The control that had focus went with the band: focus is on the page title, not the page.
    expect(screen.getByRole("heading", { name: "Dashboard" })).toHaveFocus();
    expect(
      seenCalls
        .filter((c) => c.call === "Exec.getOutput")
        .every((c) => c.background),
    ).toBe(true);
    // The result is announced politely and stays in the tasks menu until dismissed.
    expect(screen.getByText("Apply changes: Succeeded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tasks: 1 finished" }));
    const row = await screen.findByRole("menuitem", { name: /Apply changes/ });
    expect(row).toHaveTextContent("Succeeded");
    await user.click(row);
    const output = await screen.findByRole("dialog", { name: "Apply changes" });
    expect(output).toHaveTextContent('["avahi","ssh"]');
    await user.click(within(output).getByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tasks" })).toBeInTheDocument(),
    );
  });

  it("asks before undoing, naming what is lost, with focus on Cancel", async () => {
    const { user } = await shell({ scenario: "pendingChanges" });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    await user.click(
      within(band).getByRole("button", { name: "Undo 2 changes" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Undo 2 changes?",
    });
    expect(dialog).toHaveTextContent(
      "The saved changes to Network discovery (Zeroconf), SSH are discarded.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(callNames()).not.toContain("Config.revertChangesBg");

    await user.click(
      within(band).getByRole("button", { name: "Undo 2 changes" }),
    );
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: "Undo 2 changes?" }),
      ).getByRole("button", { name: "Undo 2 changes" }),
    );
    await waitFor(
      () =>
        expect(
          screen.queryByRole("region", { name: "Pending changes" }),
        ).not.toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(callNames()).toContain("Config.revertChangesBg");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toHaveFocus();
  });

  it("shows a failed apply, offers to try again, and keeps the server's account behind a control", async () => {
    const { user } = await shell({ scenario: "applyFails" });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    await user.click(
      within(band).getByRole("button", { name: "Apply 2 changes" }),
    );
    await user.click(
      within(
        await screen.findByRole("alertdialog", { name: "Apply 2 changes?" }),
      ).getByRole("button", { name: "Apply 2 changes" }),
    );
    await waitFor(() =>
      expect(band).toHaveTextContent(
        "Applying the changes failed. They are still saved and waiting.",
      ),
    );
    // The offer to try again is the default: the last control, outlined like the others, with focus.
    const retry = within(band).getByRole("button", {
      name: "Try applying again",
    });
    expect(retry).toBeEnabled();
    expect(retry).toHaveFocus();
    expect(within(band).getAllByRole("button").at(-1)).toBe(retry);
    expect(retry.className).toContain("bg-transparent");
    expect(
      within(band).getByRole("button", { name: "Undo 2 changes" }),
    ).toBeEnabled();
    // The whole Salt log is not in the band; it is one control away, as text.
    expect(band).not.toHaveTextContent("configure_ssh_sshd_config");
    await user.click(
      within(band).getByRole("button", { name: "Show what happened" }),
    );
    const output = await screen.findByRole("dialog", { name: "Apply changes" });
    expect(output).toHaveTextContent("start_ssh_service");
    expect(output).toHaveTextContent("Failed");
  });
});

describe("polling (UI-14)", () => {
  it("asks for pending changes in the background, so the poll never keeps a session alive", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await shell({ scenario: "pendingChanges" });
    await screen.findByRole("region", { name: "Pending changes" });
    const reads = () =>
      seenCalls.filter((c) => c.call === "System.getInformation");
    const before = reads().length;
    await act(() => {
      vi.advanceTimersByTime(20_000);
    });
    await waitFor(() => expect(reads().length).toBeGreaterThan(before));
    expect(
      reads()
        .slice(before)
        .every((c) => c.background),
    ).toBe(true);
  });
});

describe("the user menu", () => {
  it("names the user, sets the appearance, and links to the classic interface and About", async () => {
    // As main.tsx does before the first render.
    const uninstall = installTheme();
    const { user } = await shell();
    await user.click(
      screen.getByRole("button", { name: "Account: example-user" }),
    );
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Dark" }),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useThemeStore.getState().setPreference("system");
    uninstall();
    clearStorage();
    // Choosing keeps the menu open, as a set of options does.
    const classic = await screen.findByRole("menuitem", {
      name: "Open the classic interface (opens in a new tab)",
    });
    expect(classic).toHaveAttribute("href", "/");
    await user.click(
      screen.getByRole("menuitem", { name: "About this interface" }),
    );
    const about = await screen.findByRole("dialog", {
      name: "About this interface",
    });
    expect(about).toHaveTextContent("unofficial community plugin");
    expect(
      within(about).getByRole("link", { name: /The openmediavault project/ }),
    ).toHaveAttribute("href", "https://www.openmediavault.org/");
  });
});

describe("the command palette and the jump keys (foundation 13)", () => {
  it("opens with /, lists every page with classic pages marked, and goes with Enter", async () => {
    const { user, app } = await shell();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.keyboard("/");
    const input = await screen.findByRole("combobox", {
      name: "Search pages and actions",
    });
    await waitFor(() => expect(input).toHaveFocus());
    const cron = screen.getByRole("option", { name: /Scheduled tasks/ });
    expect(cron).toHaveTextContent("System · classic interface");
    // The shortcut beside a page teaches it.
    expect(screen.getByRole("option", { name: /^Disks/ })).toHaveTextContent(
      "gd",
    );
    await user.keyboard("shared folders{Enter}");
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(
        "/storage/shared-folders",
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Go to or do" })).toBeNull();
  });

  it("jumps with g then a letter, and not while typing", async () => {
    const { user, app } = await shell();
    await screen.findByRole("heading", { name: "Dashboard" });
    await user.keyboard("gd");
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe("/storage/disks"),
    );
    await user.keyboard("go");
    await waitFor(() => expect(app.router.state.location.pathname).toBe("/"));
  });

  it("offers to apply the pending changes, through the band's own confirmation", async () => {
    const { user } = await shell({ scenario: "pendingChanges" });
    await screen.findByRole("region", { name: "Pending changes" });
    await user.click(screen.getByRole("button", { name: "Go to or do…" }));
    const apply = await screen.findByRole("option", {
      name: /Apply 2 pending changes/,
    });
    expect(apply).toHaveTextContent("Network discovery (Zeroconf), SSH");
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Search pages and actions" }),
      ).toHaveFocus(),
    );
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("alertdialog", {
      name: "Apply 2 changes?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("Config.applyChangesBg");
  });

  it("gives a normal user the dashboard and their account only", async () => {
    const { user } = await shell({ scenario: "user" });
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("combobox", { name: "Search pages and actions" });
    expect(
      screen.getAllByRole("option").map((o) => o.textContent?.split("g")[0]),
    ).toEqual([
      expect.stringContaining("Dashboard"),
      expect.stringContaining("Your account"),
    ]);
  });
});

describe("the top bar's pending pill and density switch", () => {
  it("is a quiet chip until something waits, then counts it and leads to the band", async () => {
    const { user } = await shell({ scenario: "pendingChanges" });
    const pill = await screen.findByRole("button", {
      name: "2 pending changes",
    });
    expect(pill).toHaveTextContent("2");
    await user.click(pill);
    expect(
      screen.getByRole("region", { name: "Pending changes" }),
    ).toHaveFocus();
  });

  it("stores compact rows as a preference and puts them on <html>", async () => {
    const uninstall = installDensity();
    const { user } = await shell();
    const toggle = screen.getByRole("button", { name: "Compact rows" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(Object.keys(storageSnapshot().local)).toEqual(["omv-webui.density"]);
    await user.click(toggle);
    expect(document.documentElement.hasAttribute("data-density")).toBe(false);
    uninstall();
    clearStorage();
  });
});
