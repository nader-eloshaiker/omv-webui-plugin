// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype as a person meets it: the answer, the rows that need them, the map read by
// rows (their order, a problem flowing along one row, tracing by pointer and keyboard), a lane that
// fails and is read again, the first visit remembered and shown again, and compact density.
// Lab fixtures only; nothing here reaches the network.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStorage } from "../../stores/storageSnapshot.ts";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import { Dashboard } from "./Dashboard.tsx";
import type { DashState } from "./states.ts";

function show(
  state: DashState,
  { tips = true, compact = false }: { tips?: boolean; compact?: boolean } = {},
) {
  const onNote = vi.fn();
  render(
    <Dashboard
      state={state}
      tips={tips}
      compact={compact}
      reduced
      chrome={false}
      still
      onNote={onNote}
    />,
  );
  return { onNote };
}

const rows = () =>
  within(screen.getByRole("list", { name: "Your storage, a row each" }))
    .getAllByRole("listitem")
    .filter((li) => li.getAttribute("aria-hidden") !== "true");

const rowNamed = (start: string) => {
  const row = rows().find((li) =>
    (li.getAttribute("aria-label") ?? "").startsWith(start),
  );
  if (!row) {
    throw new Error(`No row ${start}`);
  }
  return row;
};

beforeEach(() => {
  // A browser that has seen the dashboard, unless a test says otherwise.
  useWelcomeStore.setState({ seen: true });
});

afterEach(() => {
  useWelcomeStore.setState({ seen: false });
  clearStorage();
});

describe("the NAS map dashboard", () => {
  it("answers first, then lists what needs the person, worst first, three and how many more", () => {
    show("needs-you");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Four things need you.",
      }),
    ).toBeInTheDocument();
    const list = within(
      screen.getByRole("region", { name: "What needs you" }),
    ).getAllByRole("listitem");
    expect(list).toHaveLength(3);
    expect(list[0]).toHaveTextContent("Disk sdb reports a problem");
    expect(screen.getByRole("button", { name: "1 more" })).toBeInTheDocument();
    // The first row says the reason, so the answer does not repeat it; no chips under the answer.
    expect(screen.getAllByText(/Disk sdb reports a problem/u)).toHaveLength(1);
    expect(screen.queryByRole("list", { name: "Areas of the NAS" })).toBeNull();
  });

  it("shows the hidden row on request", async () => {
    show("needs-you");
    await userEvent.click(screen.getByRole("button", { name: "1 more" }));
    expect(screen.getByText("The clocks differ by 4 days")).toBeInTheDocument();
  });

  it("has no needs-you region when all is well, and offers each map action once", () => {
    show("all-ok");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Everything is working.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What needs you" })).toBeNull();
    const map = screen.getByRole("region", { name: "Your NAS" });
    for (const action of [
      "Check disk health",
      "Add storage",
      "Add a shared folder",
      "Sharing settings",
      "Interfaces",
    ]) {
      expect(within(map).getAllByRole("button", { name: action })).toHaveLength(
        1,
      );
    }
  });

  it("names each disk with its state in words, never colour alone", () => {
    show("disk-critical");
    expect(
      screen.getByRole("button", {
        name: /^sda, Hard disk 3\.6\sTiB, Failing/u,
      }),
    ).toBeInTheDocument();
  });
});

describe("the map's rows (6.8)", () => {
  it("has a row per storage, problems first, the system drive last, unused disks at the end", () => {
    show("needs-you");
    expect(
      rows().map((li) => (li.getAttribute("aria-label") ?? "").split(",")[0]),
    ).toEqual([
      "Data drive",
      "Backup",
      "tank",
      "System drive",
      "Not in use: disk sde. Add storage to keep files on it.",
    ]);
    expect(rowNamed("Data drive")).toHaveAccessibleName(
      "Data drive, on disk sda: 92 percent used, almost full. Shared folders: Photos, Music and Documents, at risk.",
    );
  });

  it("lets a disk's problem flow right along its row and nowhere else", () => {
    show("needs-you");
    const backup = rowNamed("Backup");
    expect(
      within(backup).getByRole("button", {
        name: "Time Machine: reached by Windows and Mac, at risk",
      }),
    ).toBeInTheDocument();
    // Said once on the row, at its storage; the folders do not repeat it.
    expect(within(backup).getAllByText("At risk")).toHaveLength(1);
    expect(
      within(backup).getByText("At risk", { selector: ".dm-store *" }),
    ).toBeInTheDocument();
    const tank = rowNamed("tank");
    expect(
      within(tank).getByRole("button", { name: "Archive: reached by Linux" }),
    ).toBeInTheDocument();
    expect(within(tank).queryByText("At risk")).toBeNull();
  });

  it("lists the ways in with their state and the interface they come in over", () => {
    show("needs-you");
    const ways = screen.getByRole("list", { name: "Ways in" });
    expect(within(ways).getAllByRole("listitem")[0]).toHaveAccessibleName(
      "Windows and Mac (SMB): running, over enp2s0",
    );
    // All three run: said once beside the heading, not under each.
    expect(within(ways).queryByText("Running")).toBeNull();
    expect(screen.getByText("All running")).toBeInTheDocument();
    expect(screen.getByText("Off: Copies to other NAS")).toBeInTheDocument();
  });

  it("keeps a lone way in's own word", () => {
    show("new-nas");
    const ways = screen.getByRole("list", { name: "Ways in" });
    expect(within(ways).getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("All running")).toBeNull();
  });
});

describe("tracing by highlighting", () => {
  it("lights every folder a way in reaches when it is pointed at, and dims the rest", async () => {
    show("needs-you");
    await userEvent.hover(
      screen.getByRole("button", { name: /^Windows and Mac SMB/u }),
    );
    expect(
      screen.getByRole("button", {
        name: "Photos: reached by Windows and Mac, at risk",
      }),
    ).toHaveAttribute("data-trace", "lit");
    expect(
      screen.getByRole("button", {
        name: "Time Machine: reached by Windows and Mac, at risk",
      }),
    ).toHaveAttribute("data-trace", "lit");
    expect(
      screen.getByRole("button", { name: "Archive: reached by Linux" }),
    ).toHaveAttribute("data-trace", "dim");
    // No row is lit whole.
    expect(rowNamed("Data drive")).toHaveAttribute("data-trace", "dim");
  });

  it("lights a folder's row and the ways in it is reached by, by keyboard focus too", () => {
    show("needs-you");
    const music = screen.getByRole("button", {
      name: "Music: reached by Windows and Mac and Linux, at risk",
    });
    act(() => {
      music.focus();
    });
    expect(rowNamed("Data drive")).toHaveAttribute("data-trace", "lit");
    expect(rowNamed("Backup")).toHaveAttribute("data-trace", "dim");
    expect(
      screen.getByRole("button", { name: /^Windows and Mac SMB/u }),
    ).toHaveAttribute("data-trace", "lit");
    expect(
      screen.getByRole("button", { name: /^Linux and Unix NFS/u }),
    ).toHaveAttribute("data-trace", "lit");
    expect(
      screen.getByRole("button", { name: /^Remote sign-in SSH/u }),
    ).toHaveAttribute("data-trace", "dim");
    act(() => {
      music.blur();
    });
    expect(rowNamed("Data drive")).not.toHaveAttribute("data-trace");
  });

  it("lights a disk's row", async () => {
    show("needs-you");
    await userEvent.hover(screen.getByRole("button", { name: /^sdc, / }));
    expect(rowNamed("Backup")).toHaveAttribute("data-trace", "lit");
    expect(rowNamed("Data drive")).toHaveAttribute("data-trace", "dim");
  });

  it("is one tab stop, moved along a row and between rows by the arrow keys", () => {
    show("needs-you");
    const sda = screen.getByRole("button", { name: /^sda, / });
    expect(sda).toHaveAttribute("tabindex", "0");
    act(() => {
      sda.focus();
    });
    fireEvent.keyDown(sda, { key: "ArrowRight" });
    expect(
      screen.getByRole("button", { name: /^Data drive EXT4/u }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /^Backup/u })).toHaveFocus();
    expect(sda).toHaveAttribute("tabindex", "-1");
  });
});

describe("a lane that fails", () => {
  it("shows its read error as text in place, and reads it again", async () => {
    show("lane-failed");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not read disks");
    expect(alert).toHaveTextContent("The request timed out after 10 seconds.");
    // The rows stand, their disks unread.
    expect(
      screen.getByRole("button", { name: /^Data drive/u }),
    ).toBeInTheDocument();
    expect(
      within(rowNamed("Data drive")).getByText("Disks: not read"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByRole(
        "button",
        { name: /^sda, Hard disk/u },
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a new NAS", () => {
  it("leads with Add storage in the first steps, shows the unused disks' row and an example, each action once", () => {
    show("new-nas");
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to your NAS." }),
    ).toBeInTheDocument();
    const steps = screen.getByRole("region", { name: "First steps" });
    expect(
      within(steps).getByRole("listitem", { current: "step" }),
    ).toHaveTextContent("Add storage");
    expect(rowNamed("Not in use")).toHaveTextContent(
      "Disks sda, sdb, sdc, sdd and sde are not in use yet.",
    );
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(
      screen.getByText("A disk made ready to keep files."),
    ).toBeInTheDocument();
    for (const action of ["Add storage", "Add a shared folder"]) {
      expect(screen.getAllByRole("button", { name: action })).toHaveLength(1);
    }
  });

  it("says once on the row that its disks are not checked, not under every disk", () => {
    show("new-nas");
    const unused = rowNamed("Not in use");
    expect(
      within(unused).getByText("Not checked yet: sda, sdb, sdc, sdd and sde"),
    ).toBeInTheDocument();
    expect(within(unused).getAllByText(/not checked/iu)).toHaveLength(1);
    // Each disk's name still carries its state.
    expect(
      within(unused).getByRole("button", { name: /^sdb, .*Not checked yet/u }),
    ).toBeInTheDocument();
  });

  it("drops the example and the captions with tips off; the unused row then offers Add storage in the accent", () => {
    show("new-nas", { tips: false });
    expect(screen.queryByText("Example")).toBeNull();
    expect(screen.queryByText("A disk made ready to keep files.")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Shortcuts" }),
    ).toBeInTheDocument();
    const add = within(rowNamed("Not in use")).getByRole("button", {
      name: "Add storage",
    });
    // The filled accent: the one "do this" on the map.
    expect(add.className).toMatch(/\bbg-primary\b/u);
    expect(screen.getAllByRole("button", { name: "Add storage" })).toHaveLength(
      1,
    );
  });
});

describe("the first visit (owner decision 10)", () => {
  it("welcomes a browser that has not seen it, with the captions, and remembers it", () => {
    useWelcomeStore.setState({ seen: false });
    show("all-ok");
    expect(
      screen.getByText(/Welcome to the new interface\./u),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The drives the NAS found inside it."),
    ).toBeInTheDocument();
    expect(useWelcomeStore.getState().seen).toBe(true);
  });

  it("stays out of the way on a later visit", () => {
    show("all-ok");
    expect(screen.queryByText(/Welcome to the new interface\./u)).toBeNull();
    expect(
      screen.queryByText("The drives the NAS found inside it."),
    ).toBeNull();
  });

  it("can be seen again with Show me around", async () => {
    show("all-ok", { tips: false });
    await userEvent.click(
      screen.getByRole("button", { name: "Show me around" }),
    );
    expect(
      screen.getByText(/Welcome to the new interface\./u),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The drives the NAS found inside it."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("How computers reach your shared folders."),
    ).toBeInTheDocument();
  });

  it("leaves with Got it", async () => {
    show("new-interface");
    expect(
      screen.getByText(/Welcome to the new interface\./u),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    // It folds away (it is removed when its leaving animation ends) and the answer stays.
    expect(
      screen
        .getByText(/Welcome to the new interface\./u)
        .closest("[data-welcome-line]"),
    ).toHaveAttribute("data-leaving");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Everything is working.",
      }),
    ).toBeInTheDocument();
  });
});

describe("compact density (owner decision 11)", () => {
  it("keeps a first step's title and button and drops its explanation", () => {
    show("all-ok", { compact: true });
    const steps = screen.getByRole("region", { name: "First steps" });
    expect(
      within(steps).getByText("Change the factory password"),
    ).toBeInTheDocument();
    expect(
      within(steps).getByRole("button", { name: "Change" }),
    ).toBeInTheDocument();
    expect(
      within(steps).queryByText("The factory password may still work."),
    ).toBeNull();
  });

  it("drops the captions and the welcome's second sentence, even on a first visit", () => {
    useWelcomeStore.setState({ seen: false });
    show("all-ok", { compact: true });
    expect(
      screen.getByText(/Welcome to the new interface\./u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Your settings and files are the same/u),
    ).toBeNull();
    expect(
      screen.queryByText("The drives the NAS found inside it."),
    ).toBeNull();
  });
});

describe("add-ons", () => {
  it("are one line in This NAS: the ones this interface does not draw, and the way to the classic interface", () => {
    show("all-ok");
    expect(
      screen.queryByRole("region", { name: "From your add-ons" }),
    ).toBeNull();
    const facts = screen.getByRole("region", { name: "This NAS" });
    expect(within(facts).getByText("Add-ons")).toBeInTheDocument();
    expect(within(facts).getByText(/^compose,/u)).toBeInTheDocument();
    expect(
      within(facts).getByRole("button", {
        name: "open in the classic interface",
      }),
    ).toBeInTheDocument();
    // ZFS pools and RAID arrays are storage rows on the map.
    expect(rowNamed("tank")).toBeInTheDocument();
    expect(rowNamed("Backup")).toBeInTheDocument();
  });
});

describe("none of the generated look", () => {
  it("has no dot separators, no arrows and no sentence fragments in its words", () => {
    for (const state of ["needs-you", "all-ok", "new-nas", "many"] as const) {
      const { unmount } = render(
        <Dashboard
          state={state}
          tips
          compact={false}
          reduced
          chrome={false}
          still
          onNote={vi.fn()}
        />,
      );
      const text = document.body.textContent;
      expect(text).not.toMatch(/[\u00b7\u2022\u2192]/u);
      for (const fragment of [
        "Holds the system",
        "Not in use yet",
        "No tasks running",
        "None yet",
        "Not shared",
        "All OK",
      ]) {
        expect(text).not.toContain(fragment);
      }
      expect(text).not.toMatch(/\b(quiet|real)\b/iu);
      unmount();
    }
  });

  it("lists the first steps as a checklist, with no numbers", () => {
    show("all-ok");
    const steps = screen.getByRole("region", { name: "First steps" });
    expect(within(steps).queryByRole("list")?.tagName).toBe("UL");
    expect(within(steps).queryByText(/^[1-4]$/u)).toBeNull();
  });

  it("says once how often the live figures update, with no live dot", () => {
    show("all-ok");
    const live = screen.getByRole("region", { name: "Right now" });
    expect(
      within(live).getByText("Updates every 2 seconds"),
    ).toBeInTheDocument();
    expect(live.querySelector(".dm-live-dot")).toBeNull();
  });
});
