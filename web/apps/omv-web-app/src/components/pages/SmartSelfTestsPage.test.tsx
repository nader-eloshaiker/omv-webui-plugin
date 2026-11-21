// SPDX-License-Identifier: GPL-3.0-or-later
// Disk health > Self-tests through the whole app on MSW (phase 5 disks design 6): the table in words,
// grouped by disk, each row's Actions menu, adding and changing a test (the exact stock forms, the
// long-test rules), deleting one, "Run now" only after its confirmation and its three results, the
// empty and error states, and a normal user kept off without a call.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NEW_OBJECT_UUID } from "../../disks/diskWords.ts";
import { hourText } from "../../hooks/useSmartWords.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function selfTests(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/smart/self-tests",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Disk health" });
  return app;
}

const table = () => screen.getByRole("table", { name: "Scheduled self-tests" });
const params = (call: string) => seenCalls.find((c) => c.call === call)?.params;
/** The locale's hour, as the table writes it, escaped for a pattern. */
const at = (hour: number) =>
  hourText(hour).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const actions = (name: string) =>
  screen.findByRole("button", { name: `Actions for the ${name}` });

describe("Scheduled self-tests", () => {
  it("shows the empty state, and that monitoring is off for the whole NAS", async () => {
    await selfTests();
    expect(
      await screen.findByText(
        "No self-tests are scheduled. A regular short test lets each disk find problems early.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Monitoring is off for the whole NAS, so no self-test runs.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open the settings" }),
    ).toHaveAttribute("href", "/ui/storage/smart/settings");
    expect(
      screen.getByRole("link", { name: "Set up monitoring" }),
    ).toHaveAttribute("href", "/ui/storage/smart/set-up");
    expect(
      screen.getByRole("link", {
        name: "Scheduled tests in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/smart/tasks");
    expect(document.title).toBe("Self-tests – Disk health – openmediavault");
  });

  it("writes each test in words, grouped by disk in device order", async () => {
    await selfTests({ scenario: "disksNas" });
    await within(table()).findByText("Custom schedule");
    const rows = within(table()).getAllByRole("row").slice(1);
    const text = rows.map((r) => r.textContent ?? "");
    await waitFor(() =>
      expect(rows[0]).toHaveTextContent(
        new RegExp(
          `^/dev/sdaExample HDD 4TBShort self-testEvery Sunday at ${at(3)}Yes`,
        ),
      ),
    );
    expect(text[1]).toMatch(
      new RegExp(
        `^/dev/sdb.*Long self-testOn day 1 of every month at ${at(3)}YesMonthly long test`,
      ),
    );
    await waitFor(() =>
      expect(rows[2]).toHaveTextContent(
        new RegExp(
          `^/dev/sdc.*Every day at ${at(2)}No, the disk is not watched`,
        ),
      ),
    );
    expect(text[3]).toMatch(
      new RegExp(
        `^/dev/sde.*Transport checkIn March, on day 15, on Monday, at ${at(5)}Yes`,
      ),
    );
    expect(text[4]).toMatch(/^\/dev\/sdf.*No, turned offTurned off for now/);
    await waitFor(() =>
      expect(rows[5]).toHaveTextContent(
        new RegExp(
          `^/dev/disk/by-id/.+Not connectedShort self-testEvery Saturday at ${at(1)}No, the disk is not connected`,
        ),
      ),
    );
    expect(
      within(rows[0] as HTMLElement).getByRole("link", {
        name: "Open disk /dev/sda",
      }),
    ).toHaveAttribute("href", "/ui/storage/disks/sda");
  });

  it("starts a test only after its confirmation, and says that the disk began it", async () => {
    const { user } = await selfTests({ scenario: "disksNas" });
    await user.click(await actions("short self-test of /dev/sda"));
    await user.click(await screen.findByRole("menuitem", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "Start a short self-test on /dev/sda now?",
    );
    expect(dialog).toHaveTextContent(
      "The disk checks itself for a few minutes. It wakes up if it is asleep.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(callNames()).not.toContain("Smart.executeScheduledTest");

    await user.click(await actions("short self-test of /dev/sda"));
    await user.click(await screen.findByRole("menuitem", { name: "Run now" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Start the test",
      }),
    );
    expect(
      await screen.findByText(
        "/dev/sda started a short self-test. The disk runs it by itself; the result appears in its health details when it finishes, in about a few minutes.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(params("Smart.executeScheduledTest")).toEqual({
      uuid: "00000000-0000-4000-8000-000000000701",
    });
    expect(screen.getByRole("link", { name: "Open the disk" })).toHaveAttribute(
      "href",
      "/ui/storage/disks/sda",
    );
    await user.click(screen.getByRole("button", { name: "Show the output" }));
    expect(screen.getByText(/Testing has begun\./)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/started a short self-test/)).toBeNull();
  });

  it("says when the disk's reply does not show the test began, with the output open", async () => {
    const { user } = await selfTests({ scenario: "testUnclear" });
    await user.click(await actions("short self-test of /dev/sda"));
    await user.click(await screen.findByRole("menuitem", { name: "Run now" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Start the test",
      }),
    );
    expect(
      await screen.findByText(
        "The NAS sent the test to /dev/sda, but the disk's reply does not say it started. Read the output for the reason.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A mandatory SMART command failed/),
    ).toBeInTheDocument();
  });

  it("says when the test could not be started, with the server's message", async () => {
    const { user } = await selfTests({ scenario: "testFails" });
    await user.click(await actions("long self-test of /dev/sdb"));
    await user.click(await screen.findByRole("menuitem", { name: "Run now" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "The disk reads its whole surface. This takes hours on a large disk",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Start the test" }),
    );
    expect(
      await screen.findByText(
        "The test could not be started on /dev/sdb.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Device open failed/)).toBeInTheDocument();
  });

  it("keeps Run now unavailable, with its reason, for a disk that is not watched", async () => {
    const { user } = await selfTests({ scenario: "disksNas" });
    const sdc = await actions("short self-test of /dev/sdc");
    await waitFor(() =>
      expect(
        within(table()).getAllByText("No, the disk is not watched"),
      ).toHaveLength(1),
    );
    await user.click(sdc);
    const run = await screen.findByRole("menuitem", { name: /^Run now/ });
    expect(run).toHaveAttribute("aria-disabled", "true");
    expect(run).toHaveTextContent(
      "Watch this disk first; the NAS starts tests only on watched disks.",
    );
  });

  it("adds a test in the stock interface's exact forms, then the saved line and the band", async () => {
    const { user } = await selfTests({ scenario: "disksNas" });
    const add = await screen.findByRole("button", { name: "Add a self-test" });
    await waitFor(() =>
      expect(within(table()).getAllByText("Yes").length).toBeGreaterThan(0),
    );
    await user.click(add);
    const dialog = await screen.findByRole("dialog", {
      name: "Add a self-test",
    });
    expect(
      within(dialog).getByText(
        "A self-test runs only on a watched disk. Turn on watching on the disk's page.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("radio", { name: "Every week" }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("radio", { name: "Every month" }),
    );
    await user.click(within(dialog).getByRole("combobox", { name: "On day" }));
    await user.click(await screen.findByRole("option", { name: "30" }));
    expect(
      within(dialog).getByText("Months without this day are skipped."),
    ).toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Note" }),
      "Monthly <b>check</b>",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Saved. The changes take effect when you apply them in the band at the top of the page.",
      ),
    ).toBeInTheDocument();
    expect(params("Smart.setScheduledTest")).toEqual({
      uuid: NEW_OBJECT_UUID,
      enable: true,
      devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0101",
      comment: "Monthly <b>check</b>",
      type: "S",
      hour: "03",
      month: "*",
      dayofmonth: "30",
      dayofweek: "*",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(add).toHaveFocus());
    expect(
      await screen.findByRole("region", { name: "Pending changes" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Not applied yet")).toBeInTheDocument();
  });

  it("opens a stored test on its preset, warns about a long test every day and refuses one every hour", async () => {
    const { user } = await selfTests({ scenario: "disksNas" });
    await user.click(await actions("long self-test of /dev/sdb"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Change the self-test",
    });
    expect(
      within(dialog).getByRole("radio", { name: "Every month" }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("radio", { name: "Every day" }));
    expect(
      within(dialog).getByText(
        "A long test every day keeps the disk busy for hours each day.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Custom" }));
    expect(
      within(dialog).getByText(
        "The test runs when all four match. With both a day of the month and a weekday, it runs only on days that are both.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("combobox", { name: "Hour" }));
    await user.click(await screen.findByRole("option", { name: "Every hour" }));
    expect(
      within(dialog).getByText(
        "A long test takes hours. Choose an hour, or it would start again before it finishes.",
      ),
    ).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    await user.click(save);
    expect(callNames()).not.toContain("Smart.setScheduledTest");

    await user.click(within(dialog).getByRole("combobox", { name: "Hour" }));
    await user.click(await screen.findByRole("option", { name: hourText(4) }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(params("Smart.setScheduledTest")).toEqual({
        uuid: "00000000-0000-4000-8000-000000000702",
        enable: true,
        devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0102",
        comment: "Monthly long test",
        type: "L",
        hour: "04",
        month: "*",
        dayofmonth: "01",
        dayofweek: "*",
      }),
    );
  });

  it("keeps the dialog open with the server's message when saving fails", async () => {
    const { user } = await selfTests({
      scenario: "disksNas",
      answers: {
        smartSetScheduledTest: { status: 500, message: "The disk is gone." },
      },
    });
    await user.click(await actions("short self-test of /dev/sda"));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Change the self-test",
    });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("The self-test was not saved."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("The disk is gone.")).toBeInTheDocument();
  });

  it("deletes a test after a plain confirmation", async () => {
    const { user } = await selfTests({ scenario: "disksNas" });
    await user.click(await actions("short self-test of /dev/sda"));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete the short self-test of /dev/sda?");
    expect(dialog).toHaveTextContent(
      "It no longer runs once you apply the changes. The disk's past results are kept.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Delete self-test" }),
    );
    expect(
      await screen.findByText(/^Saved\. The changes take effect/),
    ).toBeInTheDocument();
    expect(params("Smart.deleteScheduledTest")).toEqual({
      uuid: "00000000-0000-4000-8000-000000000701",
    });
  });

  it("shows the read failure in the table", async () => {
    await selfTests({
      answers: {
        smartGetScheduleList: {
          status: 500,
          message: "The list is unreadable.",
        },
      },
    });
    expect(
      await screen.findByText("Could not read the scheduled self-tests."),
    ).toBeInTheDocument();
    expect(screen.getByText("The list is unreadable.")).toBeInTheDocument();
  });

  it("refuses a normal user without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/smart/self-tests",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    expect(callNames().filter((c) => c.startsWith("Smart."))).toEqual([]);
  });
});
