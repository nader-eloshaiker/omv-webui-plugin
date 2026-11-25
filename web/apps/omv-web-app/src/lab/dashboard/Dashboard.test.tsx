// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard prototype as a person meets it: the answer, the rows that need them, the map's
// lanes and their actions, a lane that fails and is read again, and the first visit's welcome.
// Lab fixtures only; nothing here reaches the network.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard.tsx";
import type { DashState } from "./states.ts";

function show(state: DashState, tips = true) {
  const onNote = vi.fn();
  render(
    <Dashboard
      state={state}
      tips={tips}
      compact={false}
      reduced
      chrome={false}
      still
      onNote={onNote}
    />,
  );
  return { onNote };
}

describe("the NAS map dashboard", () => {
  it("answers first, then lists what needs the person, worst first, three and how many more", () => {
    show("needs-you");
    expect(
      screen.getByRole("heading", { level: 1, name: "4 things need you" }),
    ).toBeInTheDocument();
    const rows = within(
      screen.getByRole("region", { name: "What needs you" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Disk sdb reports a problem");
    expect(screen.getByRole("button", { name: "1 more" })).toBeInTheDocument();
  });

  it("shows the hidden row on request", async () => {
    show("needs-you");
    await userEvent.click(screen.getByRole("button", { name: "1 more" }));
    expect(screen.getByText("The clocks differ by 4 days")).toBeInTheDocument();
  });

  it("has no needs-you region when all is well, and every lane ends in its action", () => {
    show("all-ok");
    expect(
      screen.getByRole("heading", { level: 1, name: "All OK" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What needs you" })).toBeNull();
    for (const action of [
      "Check disk health",
      "Add storage",
      "Add a shared folder",
      "Sharing settings",
      "Interfaces",
    ]) {
      expect(
        within(screen.getByRole("region", { name: "Your NAS" })).getByRole(
          "button",
          { name: action },
        ),
      ).toBeInTheDocument();
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

  it("shows a lane's read error as text in place, and reads it again", async () => {
    show("lane-failed");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not read disks");
    expect(alert).toHaveTextContent("The request timed out after 10 seconds.");
    // The other lanes stand.
    expect(
      screen.getByRole("button", { name: /Data drive/u }),
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

  it("welcomes a new NAS with ghosts and first steps that lead with Add storage", () => {
    show("new-nas");
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to your NAS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your storage will appear here"),
    ).toBeInTheDocument();
    const steps = screen.getByRole("region", { name: "First steps" });
    expect(
      within(steps).getByRole("listitem", { current: "step" }),
    ).toHaveTextContent("Add storage");
  });

  it("drops ghosts, captions and first steps with tips off; the empty state's sentence stays", () => {
    show("new-nas", false);
    expect(screen.queryByText("Your storage will appear here")).toBeNull();
    expect(
      screen.queryByText("A shared folder is what your computers open."),
    ).toBeNull();
    expect(screen.getByText("No shared folders yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Shortcuts" }),
    ).toBeInTheDocument();
  });

  it("welcomes an existing NAS to the new interface in one line that leaves with Got it", async () => {
    show("new-interface");
    expect(
      screen.getByText(/Welcome to the new interface\./u),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    // Reduced motion: the line leaves at once.
    expect(
      await screen.findByRole("heading", { level: 1, name: "All OK" }),
    ).toBeInTheDocument();
  });

  it("shows an unknown add-on by its package name with the way to the classic interface", () => {
    show("all-ok");
    const addOns = screen.getByRole("region", { name: "From your add-ons" });
    expect(
      within(addOns).getByText("openmediavault-compose"),
    ).toBeInTheDocument();
    expect(
      within(addOns).getByRole("button", {
        name: "Open in the classic interface",
      }),
    ).toBeInTheDocument();
  });
});
