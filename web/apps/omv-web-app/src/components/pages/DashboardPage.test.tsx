// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard and its first steps through the whole app on MSW serving the contract's examples: the
// answer and its kicker, the System card and the live figures, the attention cards, a failed
// background poll, the normal user's view (no live samples), each first step's states (and one
// failing alone), hiding them, and nothing secret or state-changing on the way (UI-4, UI-6).
import { getSystemGetInformationQueryKey } from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { liveDemand } from "../../live/liveDemand.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function dashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ signedIn: true, ...options });
  await screen.findByRole("heading", { level: 1, name: "Dashboard" });
  return app;
}

const card = (name: string) => screen.getByRole("region", { name });
/** The page's answer: a region named by the page title. */
const answer = () => card("Dashboard");
const checklist = () => screen.getByRole("region", { name: "First steps" });
/** One checklist item, by its title; its text reads "{title}: {state}. {sentences}". */
const item = (title: string) =>
  within(checklist())
    .getAllByRole("listitem")
    .find((li) => li.textContent?.includes(title))!;

/** The value beside a fact's label. */
function fact(region: HTMLElement, label: string) {
  const term = within(region).getByText(label, { selector: "dt" });
  return term.nextElementSibling;
}

describe("the administrator's dashboard", () => {
  it("shows what the NAS is and how busy it is, in plain units", async () => {
    const { user } = await dashboard({ scenario: "checklistHidden" });
    const system = card("System");
    expect(fact(system, "Name")).toHaveTextContent("nas");
    expect(fact(system, "openmediavault version")).toHaveTextContent(
      "8.6.1-1 (Synchrony)",
    );
    expect(fact(system, "Running for")).toHaveTextContent("1 day, 3 hours");
    expect(fact(system, "Time on the NAS")).toHaveTextContent(
      "Fri Nov 20 09:48:04 2026",
    );
    expect(fact(system, "Updates")).toHaveTextContent("34 available");
    expect(
      within(system).getByRole("link", {
        name: "Review updates in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/updatemgmt/updates");
    // The processor and kernel are one disclosure away.
    await user.click(
      within(system).getByRole("button", { name: "Technical details" }),
    );
    // The ARM board reports neither model nor cores.
    expect(fact(system, "Processor")).toHaveTextContent("Not reported");
    expect(fact(system, "Kernel")).toHaveTextContent(
      "Linux 6.12.117+deb13-arm64",
    );
    expect(
      within(system).getByRole("link", {
        name: "More system details in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/diagnostics/system-information");

    // Right now: the figures in words, from the session's samples.
    const live = card("Right now");
    const processor = within(live).getByRole("group", { name: "Processor" });
    await waitFor(() => expect(processor).toHaveTextContent("<1 %"));
    expect(processor).toHaveTextContent(
      "Average load 1 min 0.23 · 5 min 0.09 · 15 min 0.02",
    );
    await user.click(
      within(processor).getByRole("button", { name: "What is average load?" }),
    );
    expect(within(processor).getByText("Lower means less busy.")).toBeVisible();
    const memory = within(live).getByRole("group", { name: "Memory" });
    expect(memory).toHaveTextContent("9 %");
    // toHaveTextContent folds the no-break spaces of the sizes into plain ones.
    expect(memory).toHaveTextContent("347.8 MiB of 3.8 GiB in use");
    expect(live).toHaveTextContent(
      /Live, read every 2 seconds\. Showing the last \d+ s\./,
    );

    // The answer: nothing wrong was found, and disk health has not been asked for (D5).
    expect(within(answer()).getByText(/^Updated at /)).toBeInTheDocument();
    expect(answer()).toHaveTextContent("No problems found");
    expect(answer()).toHaveTextContent(
      "Disk health has not been checked since you signed in.",
    );
    expect(
      within(answer()).getByRole("button", { name: "Check disk health" }),
    ).toBeInTheDocument();
    const ring = within(answer()).getByRole("group", {
      name: "Health of this NAS",
    });
    expect(ring).toHaveTextContent("3/4checked");
    expect(
      within(ring)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "StorageNothing full",
      "DisksNot checked",
      "ServicesAll running",
      "SystemOK",
    ]);
    // Nothing needs attention, and the clocks agree.
    expect(
      screen.queryByRole("region", { name: "Needs attention" }),
    ).not.toBeInTheDocument();
    // Pending changes are the band's business, not repeated here.
    expect(screen.queryByText(/waiting to be applied/)).not.toBeInTheDocument();
  });

  it("lists a needed restart as a Warning, and a clock difference as advice", async () => {
    await dashboard({ scenario: "attention" });
    const list = await screen.findByRole("region", { name: "Needs attention" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/^WarningThe NAS needs a restart/);
    expect(rows[0]).toHaveTextContent(
      "Updates finish installing when it restarts.",
    );
    // The whole card is the link, named by its next step, with the reason as its description.
    const restart = within(rows[0]!).getByRole("link", {
      name: "Restart from the classic interface (opens in a new tab)",
    });
    expect(restart).toHaveAttribute("href", "/");
    expect(restart).toHaveAttribute("target", "_blank");
    expect(restart).toHaveAttribute("rel", "noopener noreferrer");
    expect(restart).toHaveAccessibleDescription(
      /^Warning The NAS needs a restart Updates finish installing/,
    );
    expect(rows[1]).toHaveTextContent(/^The clocks differ by \d+ (day|hour)/);
    expect(rows[1]).not.toHaveTextContent("Warning");
    expect(
      within(rows[1]!).getByRole("link", {
        name: "Check Date and time in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/date-time");
    // The one card with a status is the answer; the clock advice is not counted.
    expect(answer()).toHaveTextContent("The NAS needs a restart");
    expect(
      within(answer()).getByRole("group", { name: "Health of this NAS" }),
    ).toHaveTextContent("1to fix");
    expect(
      within(answer()).queryByRole("button", { name: "Check disk health" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the figures when a background poll fails, says so, and reads again in the foreground", async () => {
    let fail = false;
    const { app, user } = await dashboard({
      scenario: "checklistHidden",
      answers: {
        systemGetInformation: () =>
          fail ? { status: 500, message: "Busy." } : "adminWelcomeDismissed",
      },
    });
    fail = true;
    await act(() =>
      app.queryClient.refetchQueries({
        queryKey: getSystemGetInformationQueryKey(),
      }),
    );
    const stale = await screen.findByText(
      /^Could not update since .*The figures may be out of date\.$/,
    );
    expect(stale).toHaveAttribute("role", "status");
    expect(fact(card("System"), "Name")).toHaveTextContent("nas");
    fail = false;
    const before = seenCalls.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await within(answer()).findByText(/^Updated at /);
    const retry = seenCalls
      .slice(before)
      .find((c) => c.call === "System.getInformation");
    expect(retry?.background).toBe(false);
  });

  it("says plainly when the information has never been read, with a retry", async () => {
    let fail = false;
    const { app, user } = await dashboard({
      scenario: "checklistHidden",
      answers: {
        systemGetInformation: () =>
          fail
            ? { status: 500, message: "<b>No</b> data." }
            : "adminWelcomeDismissed",
      },
    });
    fail = true;
    await act(() =>
      app.queryClient.resetQueries({
        queryKey: getSystemGetInformationQueryKey(),
      }),
    );
    // One alert, in the System card; the answer names the area and never repeats the message.
    const alert = await within(card("System")).findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert).toHaveTextContent("Could not read the system information.");
    expect(alert).toHaveTextContent("<b>No</b> data.");
    expect(alert.querySelector("b")).toBeNull();
    expect(answer()).toHaveTextContent("Part of the NAS could not be read");
    expect(answer()).toHaveTextContent("Could not read: System.");
    expect(answer()).not.toHaveTextContent("No data.");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(fact(card("System"), "Name")).toHaveTextContent("nas"),
    );
  });

  it("sends no state-changing call on load (UI-4)", async () => {
    await dashboard();
    await within(checklist()).findByText("Etc/UTC");
    expect(
      callNames().filter((c) => !/\.(get|is|enumerate|list)/.test(c)),
    ).toEqual([]);
    // Disk health is read only when the reader asks (owner); the disk list never wakes a disk.
    expect(callNames()).not.toContain("Smart.getListBg");
    expect(callNames()).toContain("DiskMgmt.getList");
  });
});

describe("a normal user's dashboard", () => {
  it("shows the name and time of the NAS and the way to their account, and nothing else", async () => {
    await dashboard({ scenario: "user" });
    expect(answer()).toHaveTextContent("Hello, example-user");
    const nas = card("This NAS");
    expect(fact(nas, "Name")).toHaveTextContent("nas");
    expect(fact(nas, "Time on the NAS")).toHaveTextContent(
      "Thu Nov 19 11:50:30 2026",
    );
    expect(
      screen.getByText("You are signed in as example-user, with user rights."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("link", {
        name: "Your account",
      }),
    ).toHaveAttribute("href", "/ui/account/settings");
    for (const name of [
      "Right now",
      "Storage",
      "Disks",
      "System",
      "First steps",
      "Needs attention",
    ]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/^Updated at/)).not.toBeInTheDocument();
    // No live chart is mounted, so nothing asks the shell to read faster.
    expect(liveDemand.getState().charts).toBe(0);
  });
});

describe("first steps", () => {
  it("lists the six items in their fixed order, each with its state in words", async () => {
    await dashboard();
    await within(checklist()).findByText("Etc/UTC");
    const titles = within(checklist())
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual([
      "Change the factory password: Not checked.",
      "Use a secure connection (HTTPS): Not done.",
      "Get email alerts: Not done.",
      "Install updates: Not done.",
      "Name of your NAS",
      "Time zone",
    ]);
    // Signed in as another administrator: no link that would change the wrong password.
    expect(item("Change the factory password")).toHaveTextContent(
      /sign in as admin/,
    );
    expect(
      within(item("Change the factory password")).queryByRole("link"),
    ).toBeNull();
    expect(item("Use a secure connection (HTTPS)")).toHaveTextContent(
      "HTTPS is off.",
    );
    expect(
      within(item("Use a secure connection (HTTPS)")).getByRole("link"),
    ).toHaveAttribute("href", "/#/system/workbench/settings");
    expect(item("Get email alerts")).toHaveTextContent("Alerts are off.");
    expect(item("Get email alerts")).toHaveTextContent(
      "After saving there, apply the changes",
    );
    expect(within(item("Get email alerts")).getByRole("link")).toHaveAttribute(
      "href",
      "/#/system/notification/settings",
    );
    // Only the steps the NAS can confirm are counted: HTTPS and email alerts.
    expect(
      within(checklist()).getByRole("meter", { name: "First steps" }),
    ).toHaveAttribute("aria-valuetext", "0 of 2 done");
    expect(item("Install updates")).toHaveTextContent(
      "33 updates are available.",
    );
    expect(item("Name of your NAS")).toHaveTextContent(
      "Your NAS is called nas.",
    );
    expect(within(item("Name of your NAS")).getByText("nas").tagName).toBe(
      "CODE",
    );
    // The name page is built here now (phase 5 network design 13.3): a router link.
    expect(
      within(item("Name of your NAS")).getByRole("link", {
        name: "Change the name",
      }),
    ).toHaveAttribute("href", "/ui/network/general");
    expect(item("Time zone")).toHaveTextContent(
      "Time zone: Etc/UTC. Schedules, logs and the clock use it.",
    );
    expect(item("Time zone")).toHaveTextContent(
      "The clock is set automatically",
    );
    expect(within(item("Time zone")).getByRole("link")).toHaveAttribute(
      "href",
      "/#/system/date-time",
    );
  });

  it("links the built-in admin to the password form", async () => {
    const { user } = await dashboard({ scenario: "builtInAdmin" });
    const link = within(item("Change the factory password")).getByRole("link", {
      name: "Change your password",
    });
    expect(link).toHaveAttribute("href", "/ui/account/password");
    await user.click(link);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "Change password",
    });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("says HTTPS is on but unused, and gives the port as text, not as a link (UI-3)", async () => {
    await dashboard({ scenario: "httpsOn" });
    const https = await waitFor(() => {
      const found = item("Use a secure connection (HTTPS)");
      expect(found).toHaveTextContent("Done");
      return found;
    });
    expect(https).toHaveTextContent(
      "HTTPS is on, but this page was opened without it.",
    );
    expect(https).toHaveTextContent(
      "Open this page with an address that starts with https://. The secure connection uses port 443.",
    );
    expect(within(https).queryByRole("link")).toBeNull();
  });

  it("is done for email alerts once they are set up, and never holds the mail password (UI-6)", async () => {
    const { app } = await dashboard({ scenario: "alertsConfigured" });
    await within(checklist()).findByText("Alerts go to admin@example.com.");
    expect(item("Get email alerts")).toHaveTextContent(
      "Get email alerts: Done.",
    );
    expect(
      within(checklist()).getByRole("meter", { name: "First steps" }),
    ).toHaveAttribute("aria-valuetext", "1 of 2 done");
    const cached = JSON.stringify(
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain("EXAMPLE-PASSWORD");
    expect(document.body.textContent).not.toContain("EXAMPLE-PASSWORD");
  });

  it("marks one item Not checked when its read fails, with a retry for that item only", async () => {
    let fail = true;
    const failure: FixedAnswer = { status: 500, message: "Cannot read." };
    const { user } = await dashboard({
      answers: { webGuiGetSettings: () => (fail ? failure : "http") },
    });
    const https = await waitFor(() => {
      const found = item("Use a secure connection (HTTPS)");
      expect(found).toHaveTextContent(
        "Could not read the web interface settings.",
      );
      return found;
    });
    expect(https).toHaveTextContent("Not checked");
    // The others are unaffected.
    await within(checklist()).findByText("Etc/UTC");
    expect(item("Get email alerts")).toHaveTextContent("Not done");
    expect(
      within(checklist()).getAllByRole("button", { name: "Try again" }),
    ).toHaveLength(1);
    // A step not read is not counted either way.
    expect(
      within(checklist()).getByRole("meter", { name: "First steps" }),
    ).toHaveAttribute("aria-valuetext", "0 of 1 done");
    fail = false;
    await user.click(within(https).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(item("Use a secure connection (HTTPS)")).toHaveTextContent(
        "HTTPS is off.",
      ),
    );
  });

  it("is not shown once hidden", async () => {
    await dashboard({ scenario: "checklistHidden" });
    await screen.findByRole("region", { name: "System" });
    expect(
      screen.queryByRole("region", { name: "First steps" }),
    ).not.toBeInTheDocument();
    expect(callNames()).not.toContain("WebGui.getSettings");
  });

  it("asks before hiding for everyone, hides it, and moves focus to the page title", async () => {
    const { user } = await dashboard();
    await user.click(
      within(checklist()).getByRole("button", { name: "Hide first steps" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Hide first steps?",
    });
    expect(dialog).toHaveTextContent("They are hidden for every administrator");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("WebGui.dismissWelcomeMessage");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide first steps" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "First steps" }),
      ).not.toBeInTheDocument(),
    );
    expect(callNames()).toContain("WebGui.dismissWelcomeMessage");
    expect(await screen.findByText("First steps hidden.")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: "Dashboard" }),
      ).toHaveFocus(),
    );
  });

  it("keeps the dialog open with the reason when hiding fails", async () => {
    const { user } = await dashboard({
      answers: {
        webGuiDismissWelcomeMessage: {
          status: 500,
          message: "Read-only file system.",
        },
      },
    });
    await user.click(
      within(checklist()).getByRole("button", { name: "Hide first steps" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide first steps" }),
    );
    const error = await within(dialog).findByRole("alert");
    expect(error).toHaveTextContent("First steps were not hidden.");
    expect(error).toHaveTextContent("Read-only file system.");
    // Behind the open dialog, the checklist is still there.
    expect(
      screen.getByRole("region", { name: "First steps", hidden: true }),
    ).toBeInTheDocument();
  });
});
