// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync, the Copy jobs tab, through the whole app on the remembering services mock (phase 5
// services design 3, 7, 8): its four states, each job's sides, schedule and deletion in words, Run now
// with its three confirmations and the session's pill, unavailable while `rsync` is pending, Delete
// with its plain confirmation, a normal user, and no stored password anywhere in the cache (UI-6).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { timeText } from "../../hooks/useJobWords.ts";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { SERVICES_JOBS } from "../../mocks/servicesScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

/** A name as the interface puts it in a sentence: isolated (format/isolate.ts). */
const iso = (name: string) => `\u2068${name}\u2069`;
const LONG = { timeout: 15_000 };
const PASSWORD = "EXAMPLE-PASSWORD";

async function jobsTab(scenario: ScenarioName, signedInAs?: "user") {
  const app = await renderApp({
    signedIn: true,
    scenario: signedInAs === "user" ? "user" : scenario,
    path: "/services/rsync",
  });
  await screen.findByRole("heading", { level: 1, name: "Rsync" }, LONG);
  return app;
}
const table = () => screen.getByRole("region", { name: "Copy jobs" });
const rowOf = (name: string) => {
  const link = within(table()).getByRole("link", { name });
  const row = link.closest("tr");
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return row;
};
const actions = async (name: string) =>
  within(rowOf(name)).getByRole("button", { name: `Actions for ${name}` });
const params = (call: string) =>
  seenCalls.filter((c) => c.call === call).map((c) => c.params);

describe("the copy jobs list (3)", () => {
  it("lists each job with its sides, schedule and deletion in words", async () => {
    await jobsTab("servicesSome");
    await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup" });
    expect(
      screen.getByRole("link", { name: "Copy jobs", current: "page" }),
    ).toBeVisible();
    const local = rowOf("Media to Backup");
    expect(local).toHaveTextContent("Media");
    expect(local).toHaveTextContent("Backup");
    expect(local).toHaveTextContent(`Every day at ${timeText(3, 0)}`);
    expect(local).toHaveTextContent(/No$|NoActions/u);
    expect(
      within(table())
        .getByRole("link", { name: "Media to Backup" })
        .getAttribute("href"),
    ).toBe(`/ui/services/rsync/jobs/${SERVICES_JOBS.local}`);
    // The push job has no note: it is named after its sides.
    expect(
      within(table()).getByRole("link", {
        name: "Photos to /srv/copies/photos on backup.example.org",
      }),
    ).toBeVisible();
    expect(table()).toHaveTextContent(`Every Sunday at ${timeText(1, 0)}`);
    expect(table()).toHaveTextContent("Only when started here");
    expect(
      screen.getByText(
        /A copy job copies the files of one folder into another/u,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add a copy job" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open System logs" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Rsync tasks in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/services/rsync/tasks");
    expect(callNames()).not.toContain("Rsync.set");
    expect(callNames()).not.toContain("Rsync.execute");
  });

  it("says when there are no jobs yet, with the way to add one", async () => {
    await jobsTab("servicesNone");
    expect(
      await screen.findByText(
        "No copy jobs yet. A copy job keeps a second copy of a shared folder, on another disk of this NAS or on another computer.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("says the list could not be read, with the server's message and nothing else", async () => {
    await jobsTab("jobsBroken");
    expect(
      await screen.findByText("Could not read the copy jobs.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(document.body.textContent).not.toContain("mock trace");
  });

  it("marks deletion and trial runs with words and the warning shape", async () => {
    await jobsTab("jobsDeleting");
    const deleting = await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup, deleting" });
    expect(deleting.closest("tr")).toHaveTextContent("Yes");
    expect(table()).toHaveTextContent("Yes (extra options)");
    const trial = rowOf("Photos into Media, trial only");
    expect(trial).toHaveTextContent("Trial runs only");
  });

  it("keeps Run now unavailable while a job's change is pending, with the reason", async () => {
    const { user } = await jobsTab("jobsPending");
    expect(
      await screen.findByText(
        "Copy jobs cannot be started here until the pending changes are applied.",
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(await actions("Media to Backup, at 04:00"));
    const run = await screen.findByRole("menuitem", { name: /^Run now/u });
    expect(run).toHaveAttribute("aria-disabled", "true");
    expect(run).toHaveTextContent(
      "Apply the pending changes first. The NAS runs each job as it was when changes were last applied.",
    );
  });
});

describe("Run now's three confirmations (7.2)", () => {
  it("asks plainly before copying, then runs the job as a task and shows it in This session", async () => {
    const { user } = await jobsTab("servicesSome");
    await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup" });
    await waitFor(() => expect(callNames()).toContain("System.getInformation"));
    await user.click(await actions("Media to Backup"));
    await user.click(
      await screen.findByRole("menuitem", { name: /^Run now/u }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: `Copy ${iso("Media")} to ${iso("Backup")} now?`,
    });
    expect(dialog).toHaveTextContent(
      "Copies the files of Media into Backup, both on this NAS.",
    );
    expect(dialog).toHaveTextContent(
      "Files in Backup with the same name are replaced by the versions in Media.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("Rsync.execute");
    await user.click(
      within(dialog).getByRole("button", { name: "Start copying" }),
    );
    await waitFor(() =>
      expect(params("Rsync.execute")).toEqual([{ uuid: SERVICES_JOBS.local }]),
    );
    await waitFor(
      () =>
        expect(
          within(rowOf("Media to Backup")).getByText(/^(Running|Succeeded)$/u),
        ).toBeVisible(),
      LONG,
    );
  }, 30_000);

  it("uses the destructive confirmation for a job that deletes, and the trial words for a trial-only one", async () => {
    const { user } = await jobsTab("jobsDeleting");
    await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup, deleting" });
    await waitFor(() => expect(callNames()).toContain("System.getInformation"));
    await user.click(await actions("Media to Backup, deleting"));
    await user.click(
      await screen.findByRole("menuitem", { name: /^Run now/u }),
    );
    const destructive = await screen.findByRole("alertdialog", {
      name: `Copy ${iso("Media")} to ${iso("Backup")} and delete there now?`,
    });
    expect(destructive).toHaveTextContent(
      "Files in Backup that are not in Media are deleted, and cannot be got back.",
    );
    expect(
      within(destructive).getByRole("button", { name: "Copy and delete" }),
    ).toBeVisible();
    await user.click(
      within(destructive).getByRole("button", { name: "Cancel" }),
    );

    await user.click(await actions("Photos into Media, trial only"));
    await user.click(
      await screen.findByRole("menuitem", { name: /^Run now/u }),
    );
    const trial = await screen.findByRole("alertdialog", {
      name: `Run a trial of ${iso("Photos into Media, trial only")}?`,
    });
    expect(trial).toHaveTextContent(
      "It lists what the job would copy and delete, and changes nothing.",
    );
    expect(
      within(trial).getByRole("button", { name: "Run the trial" }),
    ).toBeVisible();
    await user.click(within(trial).getByRole("button", { name: "Cancel" }));
    expect(callNames()).not.toContain("Rsync.execute");
  }, 30_000);
});

describe("deleting a job (8)", () => {
  it("asks plainly, names what stays, and deletes it to the band", async () => {
    const { user } = await jobsTab("servicesSome");
    await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup" });
    await user.click(await actions("Media to Backup"));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: `Delete the copy job ${iso("Media to Backup")}?`,
    });
    expect(dialog).toHaveTextContent(
      "It no longer runs once you apply the changes. The files it copied stay in Backup, and Media is not touched.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Delete copy job" }),
    );
    expect(
      await screen.findByText(
        `${iso("Media to Backup")} will be deleted when you apply the changes.`,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(params("Rsync.delete")).toEqual([{ uuid: SERVICES_JOBS.local }]);
    // The list reads again: the deleted job is gone from it.
    await waitFor(
      () =>
        expect(
          within(table()).queryByRole("link", { name: "Media to Backup" }),
        ).toBeNull(),
      LONG,
    );
    expect(
      await screen.findByRole("region", { name: "Pending changes" }, LONG),
    ).toBeVisible();
  }, 30_000);
});

describe("who sees it, and what is kept (13.1, UI-6)", () => {
  it("shows a normal user the only-administrators page and calls nothing for it", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/services/rsync",
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Rsync" }, LONG),
    ).toBeVisible();
    expect(callNames().some((c) => c.startsWith("Rsync."))).toBe(false);
  });

  it("never holds a job's stored password in the query cache or the page", async () => {
    const { app } = await jobsTab("servicesSome");
    await within(
      await screen.findByRole("region", { name: "Copy jobs" }, LONG),
    ).findByRole("link", { name: "Media to Backup" });
    const cached = JSON.stringify(
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).toContain('"password":true');
    expect(cached).not.toContain(PASSWORD);
    expect(document.body.textContent).not.toContain(PASSWORD);
  });
});
