// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard through the whole app on MSW serving the contract's examples and the mock's
// scenarios: the answer and what needs you (fail closed), This NAS, the first steps and hiding them,
// the welcome and "Show me around", a failed background poll, the normal user's view, and nothing
// secret or state-changing on the way (UI-4, UI-6).
import { getSystemGetInformationQueryKey } from "@omv-webui/react-api-omv/generated";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { liveDemand } from "../../live/liveDemand.ts";
import { showAround } from "../../shell/showAround.ts";
import { useSeenStore } from "../../stores/useSeenStore.ts";
import { useTipsStore } from "../../stores/useTipsStore.ts";
import { useWelcomeStore } from "../../stores/useWelcomeStore.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 8000 };

beforeEach(() => {
  // A later visit by default: the welcome and the tracing tip were seen.
  useWelcomeStore.setState({ seen: true });
  useSeenStore.setState({ seen: ["tip.new-interface", "tip.trace"] });
  useTipsStore.setState({ show: true });
  showAround.reset();
});

async function dashboard(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ signedIn: true, ...options });
  await screen.findByRole("heading", { level: 2, name: "Your NAS" }, LONG);
  return app;
}

const region = (name: string) => screen.getByRole("region", { name });
/** The answer: the page's one h1. */
const answer = () => screen.getByRole("heading", { level: 1 });
const needs = () => screen.queryByRole("region", { name: "What needs you" });
const steps = () => screen.queryByRole("region", { name: /^First steps/ });

/** The value beside a fact's label. */
function fact(where: HTMLElement, label: string) {
  return within(where).getByText(label, { selector: "dt" }).nextElementSibling;
}

describe("the answer", () => {
  it("never says everything is working before disk health was checked, and says so once it was", async () => {
    const { user } = await dashboard({ scenario: "dashboardAllOk" });
    await waitFor(() =>
      expect(answer()).toHaveAccessibleName("No problems found so far."),
    );
    expect(
      screen.getByText(/Disk health has not been checked since you signed in/),
    ).toBeInTheDocument();
    expect(needs()).not.toBeInTheDocument();
    // Disk health is read only when the person asks.
    expect(callNames()).not.toContain("Smart.getListBg");
    await user.click(
      within(region("Your NAS")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    await waitFor(
      () => expect(answer()).toHaveAccessibleName("Everything is working."),
      LONG,
    );
    expect(
      screen.getByText(
        /The disks reported no problem at .*All 4 drives have space\./,
      ),
    ).toBeInTheDocument();
  });

  it("counts what needs you, worst first, and leaves the reason to the first row", async () => {
    const { user } = await dashboard({ scenario: "dashboardNeedsYou" });
    await waitFor(() =>
      expect(answer()).toHaveAccessibleName("Three things need you."),
    );
    const list = needs();
    expect(list).not.toBeNull();
    const rows = within(list!).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^Warning:“Data drive” is almost full/),
      expect.stringMatching(/^Warning:The NAS needs a restart/),
      expect.stringMatching(/^Unknown:The clocks differ by/),
    ]);
    // The worst row's next step is the screen's one filled accent; it goes to the file system.
    expect(
      within(rows[0]!).getByRole("link", {
        name: "Open file system Data drive",
      }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/ui\/storage\/filesystems\//),
    );
    const restart = within(rows[1]!).getByRole("link", {
      name: /Restart from the classic interface/,
    });
    expect(restart).toHaveAttribute("target", "_blank");
    expect(restart).toHaveAttribute("rel", "noopener noreferrer");
    // A disk reporting a problem arrives with the check the person asks for.
    await user.click(
      within(region("Your NAS")).getByRole("button", {
        name: "Check disk health",
      }),
    );
    await waitFor(
      () => expect(answer()).toHaveAccessibleName("Four things need you."),
      LONG,
    );
    expect(needs()).toHaveTextContent(/Disk \/dev\/sdb reported a problem/);
  });

  it("fails closed: a read that failed says which part could not be read, with a foreground retry in place", async () => {
    let fail = true;
    const { user } = await dashboard({
      scenario: "dashboardAllOk",
      answers: {
        servicesGetStatus: () =>
          fail
            ? { status: 500, message: "<b>systemctl</b> failed." }
            : {
                status: 200,
                value: {
                  total: 1,
                  data: [
                    { name: "ssh", title: "SSH", enabled: true, running: true },
                  ],
                },
              },
      },
    });
    await waitFor(() =>
      expect(answer()).toHaveAccessibleName(
        "Part of the NAS could not be read.",
      ),
    );
    expect(
      screen.getByText(
        /The ways in could not be read, so this page cannot say everything is working\./,
      ),
    ).toBeInTheDocument();
    const map = region("Your NAS");
    expect(map).toHaveTextContent("Could not read the ways in");
    // The server's message is text, never markup (UI-2).
    expect(
      within(map)
        .getByText(/systemctl/)
        .querySelector("b"),
    ).toBeNull();
    fail = false;
    const before = seenCalls.length;
    await user.click(within(map).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(answer()).not.toHaveAccessibleName(/could not be read/),
    );
    const retry = seenCalls
      .slice(before)
      .find((c) => c.call === "Services.getStatus");
    expect(retry?.background).toBe(false);
  });

  it("keeps what it read when a background poll fails, and says the charts may be behind", async () => {
    let fail = false;
    const { app } = await dashboard({
      scenario: "dashboardAllOk",
      answers: {
        systemGetInformation: () =>
          fail ? { status: 500, message: "Busy." } : "adminWelcomeDismissed",
      },
    });
    await waitFor(() =>
      expect(fact(region("This NAS"), "Name")).toHaveTextContent("nas"),
    );
    fail = true;
    await act(() =>
      app.queryClient.invalidateQueries({
        queryKey: getSystemGetInformationQueryKey(),
      }),
    );
    expect(
      await within(region("Right now")).findByText(/^Could not read since /),
    ).toHaveAttribute("role", "status");
    expect(fact(region("This NAS"), "Name")).toHaveTextContent("nas");
    expect(answer()).not.toHaveAccessibleName(/could not be read/);
  });

  it("sends no state-changing call on load, and never reads the RAID arrays (UI-4; journal 2026-11-27)", async () => {
    await dashboard({ scenario: "dashboard24Disks" });
    await within(region("Disk temperatures")).findByText(/^Read at /, {}, LONG);
    expect(
      callNames().filter((c) => !/\.(get|is|enumerate|list)/.test(c)),
    ).toEqual([]);
    expect(callNames()).not.toContain("Smart.getListBg");
    for (const call of [
      "MdMgmt.enumerateDevices",
      "MdMgmt.getDetail",
      "MdMgmt.getSlaves",
    ]) {
      expect(callNames()).not.toContain(call);
    }
  });
});

describe("This NAS", () => {
  it("says what the NAS is, from System.getInformation", async () => {
    await dashboard({ scenario: "dashboardAllOk" });
    const nas = region("This NAS");
    await waitFor(() => expect(fact(nas, "Name")).toHaveTextContent("nas"));
    expect(fact(nas, "Version")).toHaveTextContent("8.6.1-1 (Synchrony)");
    expect(fact(nas, "Running for")).toHaveTextContent("1 day, 3 hours");
    expect(fact(nas, "Time on the NAS")).toHaveTextContent(
      "Fri Nov 20 09:48:04 2026",
    );
    expect(
      within(nas).getByRole("link", { name: /34 to install/ }),
    ).toHaveAttribute("href", "/#/system/updatemgmt/updates");
  });
});

describe("the first steps", () => {
  it("lead a new NAS with storage, offer each action once, and stand above the map", async () => {
    await dashboard({ scenario: "dashboardNewNas" });
    await waitFor(() =>
      expect(answer()).toHaveAccessibleName("Welcome to your NAS."),
    );
    const list = steps();
    expect(list).not.toBeNull();
    expect(list).toHaveTextContent("0 of 4 done");
    const titles = within(list!)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(titles[0]).toMatch(/^Add storage/);
    expect(titles[1]).toMatch(/^Add a shared folder/);
    expect(
      within(list!).getByRole("link", { name: "Add storage" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems/add");
    // The steps come before the map; the map does not offer Add storage again.
    expect(
      list!.compareDocumentPosition(region("Your NAS")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(region("Your NAS")).queryByRole("link", { name: "Add storage" }),
    ).not.toBeInTheDocument();
  });

  it("are done for email alerts once they are set up, and never hold the mail password (UI-6)", async () => {
    const { app } = await dashboard({ scenario: "alertsConfigured" });
    await waitFor(() =>
      expect(steps()).toHaveTextContent("Alerts go to admin@example.com."),
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

  it("link the built-in admin to the password form", async () => {
    await dashboard({ scenario: "builtInAdmin" });
    await waitFor(() => expect(steps()).not.toBeNull());
    expect(
      within(steps()!).getByRole("link", { name: "Change" }),
    ).toHaveAttribute("href", "/ui/account/password");
  });

  it("say on its step when a read failed, with a retry for that step only", async () => {
    let fail = true;
    const failure: FixedAnswer = { status: 500, message: "Cannot read." };
    const { user } = await dashboard({
      answers: { webGuiGetSettings: () => (fail ? failure : "http") },
    });
    await waitFor(() =>
      expect(steps()).toHaveTextContent(
        "Could not read the web interface settings.",
      ),
    );
    expect(
      within(steps()!).getAllByRole("button", { name: "Try again" }),
    ).toHaveLength(1);
    fail = false;
    await user.click(
      within(steps()!).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(steps()).not.toHaveTextContent("Could not read"),
    );
  });

  it("become Shortcuts with tips off, and none of the first steps' reads is made once hidden", async () => {
    useTipsStore.setState({ show: false });
    await dashboard();
    const shortcuts = await screen.findByRole("region", { name: "Shortcuts" });
    expect(steps()).not.toBeInTheDocument();
    await within(shortcuts).findByRole("link", {
      name: /Turn on secure sign-in/,
    });
    expect(
      within(shortcuts).getByRole("link", { name: "Add a person" }),
    ).toHaveAttribute("href", "/ui/usermgmt/users/add");
  });

  it("are not read once hidden", async () => {
    await dashboard({ scenario: "checklistHidden" });
    await screen.findByRole("region", { name: "Shortcuts" });
    expect(callNames()).not.toContain("WebGui.getSettings");
  });

  it("ask before hiding for everyone, hide, and move focus to the answer", async () => {
    const { user } = await dashboard();
    await waitFor(() => expect(steps()).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Hide first steps" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Hide first steps?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("WebGui.dismissWelcomeMessage");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide first steps" }),
    );
    await waitFor(() => expect(steps()).not.toBeInTheDocument());
    expect(callNames()).toContain("WebGui.dismissWelcomeMessage");
    expect(await screen.findByText("First steps hidden.")).toBeInTheDocument();
    await waitFor(() => expect(answer()).toHaveFocus());
  });

  it("keep the dialog open with the reason when hiding fails", async () => {
    const { user } = await dashboard({
      answers: {
        webGuiDismissWelcomeMessage: {
          status: 500,
          message: "Read-only file system.",
        },
      },
    });
    await waitFor(() => expect(steps()).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Hide first steps" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Hide first steps" }),
    );
    const error = await within(dialog).findByRole("alert");
    expect(error).toHaveTextContent("First steps were not hidden.");
    expect(error).toHaveTextContent("Read-only file system.");
  });
});

describe("the welcome", () => {
  it("greets a first visit to the new interface, is remembered, and comes back with Show me around", async () => {
    useWelcomeStore.setState({ seen: false });
    useSeenStore.setState({ seen: [] });
    const { user } = await dashboard({ scenario: "dashboardAllOk" });
    expect(
      await screen.findByText("Welcome to the new interface."),
    ).toBeInTheDocument();
    // The newcomer's captions under the map's columns.
    expect(region("Your NAS")).toHaveTextContent(
      "A disk made ready to keep files.",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Got it, hide the welcome to the new interface",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Welcome to the new interface."),
      ).not.toBeInTheDocument(),
    );
    expect(useSeenStore.getState().seen).toContain("tip.new-interface");
    await waitFor(() => expect(useWelcomeStore.getState().seen).toBe(true));
    await user.click(screen.getByRole("button", { name: "Show me around" }));
    expect(
      await screen.findByText("Welcome to the new interface."),
    ).toBeInTheDocument();
  });

  it("is not shown on a later visit, and the captions are not either", async () => {
    await dashboard({ scenario: "dashboardAllOk" });
    await waitFor(() =>
      expect(answer()).toHaveAccessibleName("No problems found so far."),
    );
    expect(
      screen.queryByText("Welcome to the new interface."),
    ).not.toBeInTheDocument();
    expect(region("Your NAS")).not.toHaveTextContent(
      "A disk made ready to keep files.",
    );
  });
});

describe("a normal user's dashboard", () => {
  it("shows the name and time of the NAS and the way to their account, and nothing else", async () => {
    await renderApp({ signedIn: true, scenario: "user" });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Hello, example-user",
      }),
    ).toBeInTheDocument();
    const nas = region("This NAS");
    await waitFor(() => expect(fact(nas, "Name")).toHaveTextContent("nas"));
    expect(fact(nas, "Time on the NAS")).toHaveTextContent(
      "Thu Nov 19 11:50:30 2026",
    );
    expect(
      screen.getByText("You are signed in as example-user, with user rights."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("link", {
        name: /Your account/,
      }),
    ).toHaveAttribute("href", "/ui/account/settings");
    for (const name of [
      "Your NAS",
      "Right now",
      "Disk temperatures",
      "What needs you",
    ]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    for (const call of [
      "FileSystemMgmt.enumerateMountedFilesystems",
      "FileSystemMgmt.getList",
      "Services.getStatus",
      "Network.enumerateDevicesList",
      "DiskMgmt.getList",
      "Smart.getInformation",
      "Smart.getListBg",
      "ShareMgmt.getList",
      "Zfs.getPoolStatus",
    ]) {
      expect(callNames()).not.toContain(call);
    }
    // No live chart is mounted, so nothing asks the shell to read faster.
    expect(liveDemand.getState().charts).toBe(0);
  });
});
