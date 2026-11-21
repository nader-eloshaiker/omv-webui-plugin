// SPDX-License-Identifier: GPL-3.0-or-later
// Disk health > Settings through the whole app on MSW (phase 5 disks design 5): the five fields from
// what is saved, a value set elsewhere, Save sends all five, the band and the pending mark, the range
// checks in words, a failed save, the error state, and a normal user kept off without a call.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function settingsPage(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/smart/settings",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Disk health" });
  await screen.findByRole("form", { name: "Settings" });
  return app;
}

const save = () => screen.getByRole("button", { name: "Save" });
const watch = () => screen.getByRole("checkbox", { name: "Watch disk health" });
const minutes = () => screen.getByRole("textbox", { name: /^Check every/ });

describe("Disk health settings", () => {
  it("shows what is saved: the factory settings, off", async () => {
    await settingsPage();
    expect(watch()).not.toBeChecked();
    expect(
      screen.getByText(
        "With this off, no disk is checked and no self-test runs.",
      ),
    ).toBeInTheDocument();
    expect(minutes()).toHaveValue("30");
    expect(
      screen.getByRole("radio", {
        name: "Check it anyway; the check wakes the disk up",
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", {
        name: "Skip the check, so the disk stays asleep (recommended)",
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Warn when a disk gets too hot" }),
    ).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /^Warn at/ })).toBeNull();
    expect(save()).toHaveAttribute("aria-disabled", "true");
    expect(document.title).toBe("Settings – Disk health – openmediavault");
    // The tabs, with Settings current.
    const tabs = screen.getByRole("navigation", { name: "Disk health" });
    expect(
      within(tabs).getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("href", "/ui/storage/smart/overview");
  });

  it("saves all five fields, then the band and the pending mark appear", async () => {
    const { user } = await settingsPage();
    await user.click(watch());
    await user.click(
      screen.getByRole("radio", {
        name: "Skip the check, so the disk stays asleep (recommended)",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Warn when a disk gets too hot" }),
    );
    const warnAt = screen.getByRole("textbox", { name: /^Warn at/ });
    expect(warnAt).toHaveValue("55");
    expect(screen.getByText(/and emails you at 60\s°C\./)).toBeInTheDocument();
    await user.click(save());
    expect(
      await screen.findByText(
        "Saved. The changes take effect when you apply them in the band at the top of the page.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      seenCalls.find((c) => c.call === "Smart.setSettings")?.params,
    ).toEqual({
      enable: true,
      interval: 1800,
      powermode: "standby",
      tempmax: 55,
      tempdiff: 0,
    });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    expect(band).toBeInTheDocument();
    expect(await screen.findByText("Not applied yet")).toBeInTheDocument();
  });

  it("refuses a number out of range in words and sends nothing", async () => {
    const { user } = await settingsPage();
    await user.clear(minutes());
    await user.type(minutes(), "0");
    await user.click(save());
    expect(
      await screen.findByText(
        "Enter a whole number of minutes from 1 to 1440.",
      ),
    ).toBeInTheDocument();
    expect(minutes()).toHaveAttribute("aria-invalid", "true");
    expect(callNames()).not.toContain("Smart.setSettings");
  });

  it("rounds an interval set elsewhere, and says so", async () => {
    await settingsPage({ scenario: "smartOddInterval" });
    expect(watch()).toBeChecked();
    expect(minutes()).toHaveValue("1");
    expect(
      screen.getByText(
        /Now every 45 seconds, set elsewhere\. Saving rounds it to whole minutes\./,
      ),
    ).toBeInTheDocument();
    expect(save()).toHaveAttribute("aria-disabled", "true");
  });

  it("records temperature changes under More", async () => {
    const { user } = await settingsPage({ scenario: "disksNas" });
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Record temperature changes" }),
    );
    const at = screen.getByRole("textbox", { name: /^Of at least/ });
    await user.clear(at);
    await user.type(at, "3");
    await user.click(save());
    await waitFor(() =>
      expect(
        seenCalls.find((c) => c.call === "Smart.setSettings")?.params,
      ).toEqual({
        enable: true,
        interval: 1800,
        powermode: "standby",
        tempmax: 50,
        tempdiff: 3,
      }),
    );
  });

  it("keeps the edits and says why when saving fails, with focus on the message", async () => {
    const { user } = await settingsPage({
      answers: {
        smartSetSettings: {
          status: 500,
          message: "The configuration is locked.",
        },
      },
    });
    await user.click(watch());
    await user.click(save());
    const alert = await screen.findByText(
      "The monitoring settings were not saved.",
    );
    expect(
      await screen.findByText("The configuration is locked."),
    ).toBeInTheDocument();
    await waitFor(() => expect(alert.closest("[tabindex='-1']")).toHaveFocus());
    expect(watch()).toBeChecked();
    expect(screen.queryByText(/mock trace/)).toBeNull();
  });

  it("shows the read failure with Try again", async () => {
    const { user } = await renderApp({
      signedIn: true,
      path: "/storage/smart/settings",
      answers: {
        smartGetSettings: { status: 500, message: "Cannot read the database." },
      },
    });
    expect(
      await screen.findByText("Could not read the monitoring settings."),
    ).toBeInTheDocument();
    expect(screen.getByText("Cannot read the database.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        seenCalls.filter((c) => c.call === "Smart.getSettings").length,
      ).toBeGreaterThan(1),
    );
  });

  it("refuses a normal user without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/smart/settings",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    expect(callNames().filter((c) => c.startsWith("Smart."))).toEqual([]);
  });
});
