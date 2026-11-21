// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > System logs through the whole app on MSW: nothing is read before a log is chosen
// (D10); a choice reads the whole log once, and search, sort and paging then run in the browser with
// no further call; each log's layout; the empty, filtered-empty and error states; log lines as text
// (UI-2); and a normal user kept off the page without a call (UI-4).
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function logs(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/diagnostics/system-logs",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "System logs" });
  return app;
}

const reads = () => seenCalls.filter((c) => c.call === "LogFile.getList");

async function choose(user: UserEvent, log: string) {
  await user.click(screen.getByRole("combobox", { name: "Log" }));
  await user.click(await screen.findByRole("option", { name: log }));
}

const table = () => screen.getByRole("table");

describe("System logs", () => {
  it("reads nothing until a log is chosen", async () => {
    await logs();
    expect(
      screen.getByText(
        "What the NAS has recorded. Choose a log to read it. Times are shown in this computer's time zone.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose a log above to read it."),
    ).toBeInTheDocument();
    // No empty table frame or column headers above the sentence.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toHaveAttribute("aria-disabled", "true");
    expect(refresh).toHaveAccessibleDescription("Choose a log first");
    expect(callNames()).not.toContain("LogFile.getList");
    expect(
      screen.getByRole("link", {
        name: "System logs in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/diagnostics/system-logs/logs");
    expect(
      screen.getByRole("link", {
        name: "Remote logging in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/diagnostics/system-logs/remote");
  });

  it("offers the eleven stock logs in two named groups", async () => {
    const { user } = await logs();
    await user.click(screen.getByRole("combobox", { name: "Log" }));
    const listbox = await screen.findByRole("listbox");
    const groups = within(listbox).getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAccessibleName("The whole system");
    expect(within(groups[0]!).getAllByRole("option")).toHaveLength(6);
    expect(groups[1]).toHaveAccessibleName("Storage, sharing and updates");
    expect(
      within(groups[1]!)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Disk health monitoring (S.M.A.R.T.)",
      "File access over SMB/CIFS (audit)",
      "Rsync jobs",
      "Rsync server",
      "Software updates",
    ]);
  });

  it("reads a chosen log once, whole and newest first, and pages, sorts and searches it in the browser", async () => {
    const { user } = await logs({ scenario: "logsLarge" });
    await choose(user, "All system messages (syslog)");
    expect(await screen.findByText(/^5,000 entries, read at /)).toHaveAttribute(
      "role",
      "status",
    );
    expect(reads()).toHaveLength(1);
    expect(reads()[0]?.params).toEqual({
      id: "syslog",
      start: 0,
      limit: null,
      sortfield: "ts",
      sortdir: "desc",
    });
    expect(reads()[0]?.background).toBe(false);
    const rows = within(table()).getAllByRole("row");
    // The header and 50 rows, the newest first.
    expect(rows).toHaveLength(51);
    expect(rows[1]).toHaveTextContent("entry 4999 of the example log");
    expect(screen.getByText("1–50 of 5,000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 5,000")).toBeInTheDocument();

    await user.click(within(table()).getByRole("button", { name: "Time" }));
    expect(
      within(table()).getByRole("columnheader", { name: "Time" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(within(table()).getAllByRole("row")[1]).toHaveTextContent(
      "entry 0 of",
    );
    expect(screen.getByText("Sorted by Time, ascending")).toBeInTheDocument();
    // The message is not sortable.
    expect(
      within(table()).queryByRole("button", { name: "Message" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: "Search this log" }),
      "entry 4321 ",
    );
    expect(
      await screen.findByText("1 of 5,000 entries matches."),
    ).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(2);
    expect(reads()).toHaveLength(1);
  });

  it("says when nothing matches, and clears the search back to the full log", async () => {
    const { user } = await logs();
    await choose(user, "All system messages (syslog)");
    await screen.findByText(/^5 entries/);
    const search = screen.getByRole("searchbox", { name: "Search this log" });
    await user.type(search, "<b>nothing</b>");
    const empty = await screen.findByText('No entries match "<b>nothing</b>".');
    expect(empty.querySelector("b")).toBeNull();
    // The empty state's own button, beside the search box's clear mark.
    await user.click(
      screen.getByText("Clear the search", { selector: "button" }),
    );
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(within(table()).getAllByRole("row")).toHaveLength(6);
  });

  it("counts the entries received, so the count line never contradicts the table", async () => {
    const { user } = await logs();
    // The captured syslog reply says total 28,028 for the five lines it carries.
    await choose(user, "All system messages (syslog)");
    expect(await screen.findByText(/^5 entries, read at /)).toBeInTheDocument();
    expect(screen.queryByText(/28,028/)).not.toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("1–5 of 5")).toBeInTheDocument();
    await choose(user, "Software updates");
    expect(await screen.findByText(/^3 entries, read at /)).toBeInTheDocument();
    expect(within(table()).getAllByRole("row")).toHaveLength(4);
  });

  it("reads again only on Refresh, and not when the same log is chosen again", async () => {
    const { user } = await logs();
    await choose(user, "All system messages (syslog)");
    await screen.findByText(/^5 entries/);
    await choose(user, "All system messages (syslog)");
    expect(reads()).toHaveLength(1);
    const refresh = screen.getByRole("button", { name: "Refresh" });
    await user.click(refresh);
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(reads()[1]?.background).toBe(false);
    await screen.findByText(/^5 entries/);
    expect(refresh).toHaveFocus();
  });

  it("lays out the audit log with its own columns", async () => {
    const { user } = await logs();
    await choose(user, "File access over SMB/CIFS (audit)");
    await screen.findByText(/^2 entries/);
    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Time",
      "User",
      "Computer",
      "Shared folder",
      "File",
      "Action",
      "Result",
    ]);
    const rows = within(table()).getAllByRole("row");
    expect(rows[1]).toHaveTextContent(
      "example-user192.0.2.10mediaold.jpgphotos/old.jpgunlinkatok",
    );
    // The host name is not shown.
    expect(table()).not.toHaveTextContent("EXAMPLE-PC");
    expect(
      screen.getByRole("region", {
        name: "Entries of File access over SMB/CIFS (audit)",
      }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("says the updates log has no times, and turns its order with a button", async () => {
    const { user } = await logs();
    await choose(user, "Software updates");
    await screen.findByText(/^3 entries/);
    expect(
      screen.getByText(
        "This log has no times. The newest lines are at the top.",
      ),
    ).toBeInTheDocument();
    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Message"]);
    expect(reads()[0]?.params).toMatchObject({
      id: "apt_term",
      sortfield: "rownum",
    });
    const rows = () => within(table()).getAllByRole("row");
    expect(rows()[1]).toHaveTextContent("Log ended");
    await user.click(screen.getByRole("button", { name: "Oldest first" }));
    expect(rows()[1]).toHaveTextContent("Processing triggers");
    expect(
      screen.getByRole("button", { name: "Newest first" }),
    ).toBeInTheDocument();
  });

  it("says a log is empty, and how the audit log gets entries", async () => {
    const { user } = await logs();
    await choose(user, "Disk health monitoring (S.M.A.R.T.)");
    expect(await screen.findByText("This log is empty.")).toBeInTheDocument();
    await choose(user, "File access over SMB/CIFS (audit)");
    await screen.findByText(/^2 entries/);
    await choose(user, "Rsync jobs");
    expect(
      await screen.findByText(
        "Nothing is recorded here until an rsync job has run.",
      ),
    ).toBeInTheDocument();
  });

  it("says plainly when a log could not be read, keeps the picker usable, and tries again", async () => {
    const { user } = await logs({ scenario: "logsFail" });
    await choose(user, "Signing in and permissions (auth)");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read this log.");
    expect(alert).toHaveTextContent("journalctl");
    expect(alert).not.toHaveTextContent("mock trace");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(screen.getByRole("combobox", { name: "Log" })).toBeEnabled();
  });

  it("shows long, right-to-left and markup-looking lines as text", async () => {
    const { user } = await logs({ scenario: "logsHostile" });
    await choose(user, "All system messages (syslog)");
    await screen.findByText(/^4 entries/);
    const body = table();
    expect(body.querySelectorAll("img, script, a")).toHaveLength(0);
    expect(body).toHaveTextContent(
      '<img src=x onerror="alert(1)"> <script>alert(2)</script>',
    );
    // Each message in its own direction, and no bidirectional control left to reverse it.
    expect(body.querySelectorAll('td [dir="auto"]')).toHaveLength(4);
    expect(body.textContent).not.toMatch(
      /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/,
    );
    expect(body).toHaveTextContent(
      "right-to-left override, then javascript:alert(3)",
    );
    expect(body).toHaveTextContent("a very long line end");
  });

  it("refuses a normal user without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/diagnostics/system-logs",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    expect(callNames()).not.toContain("LogFile.getList");
  });
});
