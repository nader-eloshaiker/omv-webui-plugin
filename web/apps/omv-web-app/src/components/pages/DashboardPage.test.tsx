// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard and the set-up checklist through the whole app on MSW serving the contract's examples:
// the System and Usage figures, the attention list, the freshness line and a failed background poll,
// the normal user's view, each checklist item's states (and one item failing alone), hiding the
// checklist, and nothing secret or state-changing on the way (UI-4, UI-6).
import { getSystemGetInformationQueryKey } from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const NBSP = " ";

async function dashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ signedIn: true, ...options });
  await screen.findByRole("heading", { level: 1, name: "Dashboard" });
  return app;
}

const card = (name: string) => screen.getByRole("region", { name });
const checklist = () => screen.getByRole("region", { name: "Set up your NAS" });
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
    await dashboard({ scenario: "checklistHidden" });
    const system = card("System");
    expect(fact(system, "Name")).toHaveTextContent("nas");
    expect(fact(system, "openmediavault version")).toHaveTextContent(
      "8.6.1-1 (Synchrony)",
    );
    // The ARM board reports neither model nor cores.
    expect(fact(system, "Processor")).toHaveTextContent("Not reported");
    expect(fact(system, "Running for")).toHaveTextContent("1 day, 3 hours");
    expect(fact(system, "Time on the NAS")).toHaveTextContent(
      "Fri Nov 20 09:48:04 2026",
    );
    expect(fact(system, "Kernel")).toHaveTextContent(
      "Linux 6.12.117+deb13-arm64",
    );
    expect(fact(system, "Updates")).toHaveTextContent("34 available");
    expect(
      within(system).getByRole("link", {
        name: "Review updates in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/updatemgmt/updates");
    expect(
      within(system).getByRole("link", {
        name: "More system details in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/diagnostics/system-information");

    const usage = card("Usage");
    const meters = within(usage).getAllByRole("meter");
    expect(meters[0]).toHaveAccessibleName("Processor");
    expect(meters[0]).toHaveAttribute("aria-valuetext", "<1% in use");
    expect(meters[1]).toHaveAccessibleName("Memory");
    expect(meters[1]).toHaveAttribute(
      "aria-valuetext",
      `347.8${NBSP}MiB of 3.8${NBSP}GiB in use (9%)`,
    );
    expect(
      within(usage).getByText("1 min 0.23 · 5 min 0.09 · 15 min 0.02"),
    ).toBeInTheDocument();
    expect(
      within(usage).getByText("Lower means less busy."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Updated every 20 seconds\. Last update/),
    ).toBeInTheDocument();
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
    expect(rows[0]).toHaveTextContent("Warning");
    expect(rows[0]).toHaveTextContent(
      "A restart is needed to finish installing updates.",
    );
    expect(
      within(rows[0]!).getByRole("link", {
        name: "Open the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/");
    expect(rows[1]).toHaveTextContent(
      /The NAS clock and this computer's clock differ by \d+ (day|hour)/,
    );
    expect(rows[1]).not.toHaveTextContent("Warning");
    expect(
      within(rows[1]!).getByRole("link", {
        name: "Check Date and time in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/date-time");
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
    await screen.findByText(/^Updated every 20 seconds/);
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
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the system information.");
    expect(alert).toHaveTextContent("<b>No</b> data.");
    expect(alert.querySelector("b")).toBeNull();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("region", { name: "System" }),
    ).toBeInTheDocument();
  });

  it("sends no state-changing call on load (UI-4)", async () => {
    await dashboard();
    await within(checklist()).findByText("Etc/UTC");
    expect(
      callNames().filter((c) => !/\.(get|is|enumerate|list)/.test(c)),
    ).toEqual([]);
    // Disk health is read only when the reader asks (owner).
    expect(callNames()).not.toContain("Smart.getListBg");
  });
});

describe("a normal user's dashboard", () => {
  it("shows the name and time of the NAS and the way to their account, and nothing else", async () => {
    await dashboard({ scenario: "user" });
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
      "Usage",
      "System",
      "Set up your NAS",
      "Needs attention",
    ]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/^Updated every/)).not.toBeInTheDocument();
  });
});

describe("the set-up checklist", () => {
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
      screen.queryByRole("region", { name: "Set up your NAS" }),
    ).not.toBeInTheDocument();
    expect(callNames()).not.toContain("WebGui.getSettings");
  });

  it("asks before hiding for everyone, hides it, and moves focus to the page title", async () => {
    const { user } = await dashboard();
    await user.click(
      within(checklist()).getByRole("button", { name: "Hide the checklist" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Hide the set-up checklist?",
    });
    expect(dialog).toHaveTextContent("It is hidden for every administrator");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("WebGui.dismissWelcomeMessage");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide the checklist" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Set up your NAS" }),
      ).not.toBeInTheDocument(),
    );
    expect(callNames()).toContain("WebGui.dismissWelcomeMessage");
    expect(
      await screen.findByText("Set-up checklist hidden."),
    ).toBeInTheDocument();
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
      within(checklist()).getByRole("button", { name: "Hide the checklist" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide the checklist" }),
    );
    const error = await within(dialog).findByRole("alert");
    expect(error).toHaveTextContent("The checklist was not hidden.");
    expect(error).toHaveTextContent("Read-only file system.");
    // Behind the open dialog, the checklist is still there.
    expect(
      screen.getByRole("region", { name: "Set up your NAS", hidden: true }),
    ).toBeInTheDocument();
  });
});
