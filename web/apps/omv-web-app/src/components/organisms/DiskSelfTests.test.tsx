// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's scheduled self-tests on its page, through the whole app on MSW (phase 5 disks design 2.6):
// only this disk's tests, without the Disk column, the same row actions, "Add a self-test" with this
// disk chosen, the empty text and the not-watched note, and no waking call without a confirmation.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";
import { rowValues } from "../../test/tableText.ts";

async function diskPage(
  name: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario: "disksNas",
    path: `/storage/disks/${name}`,
    ...options,
  });
  const section = await screen.findByRole("region", {
    name: "Scheduled self-tests",
  });
  return { ...app, section };
}

describe("a disk's scheduled self-tests", () => {
  it("lists only this disk's tests, without a Disk column", async () => {
    const { section } = await diskPage("sda");
    const table = await within(section).findByRole("table", {
      name: "Scheduled self-tests",
    });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Test", "When", "Runs", "Note", "Actions"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rowValues(rows[0]!)).toMatch(/^Short self-testEvery Sunday at/);
    expect(
      within(section).getByRole("link", { name: "All scheduled self-tests" }),
    ).toHaveAttribute("href", "/ui/storage/smart/self-tests");
    expect(callNames()).not.toContain("Smart.executeScheduledTest");
  });

  it("adds a test with this disk chosen", async () => {
    const { user, section } = await diskPage("sdb");
    await within(section).findByRole("table", { name: "Scheduled self-tests" });
    await user.click(
      within(section).getByRole("button", { name: "Add a self-test" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Add a self-test",
    });
    expect(
      within(dialog).getByRole("combobox", { name: "Disk" }),
      // The model is isolated (FSI … PDI) inside the option's words.
    ).toHaveTextContent(/^\/dev\/sdb, \u2068Example HDD 4TB\u2069/);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        seenCalls.find((c) => c.call === "Smart.setScheduledTest")?.params,
      ).toMatchObject({
        devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0102",
        type: "S",
        dayofweek: "7",
        hour: "03",
      }),
    );
    expect(
      await within(section).findByText(/^Saved\. The changes take effect/),
    ).toBeInTheDocument();
  });

  it("says when the disk has none, and that tests run only while it is watched", async () => {
    const { section } = await diskPage("sdd");
    expect(
      await within(section).findByText(
        "No self-tests are scheduled for this disk. A regular short test lets the disk find problems early.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(section).findByText(
        "Self-tests run only while the disk is watched.",
      ),
    ).toBeInTheDocument();
  });

  it("starts a test from the disk's page only after the confirmation, and shows its result there", async () => {
    const { user, section } = await diskPage("sda");
    await within(section).findByRole("table", { name: "Scheduled self-tests" });
    const actions = within(section).getByRole("button", {
      name: "Actions for the short self-test of /dev/sda",
    });
    await waitFor(async () => {
      await user.click(actions);
      expect(
        await screen.findByRole("menuitem", { name: "Run now" }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
    await user.click(screen.getByRole("menuitem", { name: "Run now" }));
    expect(callNames()).not.toContain("Smart.executeScheduledTest");
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Start the test",
      }),
    );
    expect(
      await within(section).findByText(
        /^\/dev\/sda started a short self-test\./,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });
});
