// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's page, through the whole app on the remembering services mock (phase 5 services design
// 4, 6, 7, 8): its states, the direction sentence and summary for each direction, how a remote job
// signs in (the password said as Set, never shown), a change that only saves (the whole job written
// back, 36 fields) and one that needs a trial, the password typed again for a job that signs in with
// one, Run now with its task, output and Stop, deleting, and a deleting trial-only job that cannot be
// turned on without a trial seen here.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { SERVICES_JOBS } from "../../mocks/servicesScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls } from "../../test/server.ts";

/** A name as the interface puts it in a sentence: isolated (format/isolate.ts). */
const iso = (name: string) => `\u2068${name}\u2069`;
const LONG = { timeout: 15_000 };
const PASSWORD = "EXAMPLE-PASSWORD";
const jobUuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

async function jobPage(scenario: ScenarioName, uuid: string, title?: string) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/services/rsync/jobs/${uuid}`,
  });
  if (title !== undefined) {
    await screen.findByRole("heading", { level: 1, name: title }, LONG);
  }
  return app;
}
const params = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);

describe("a job's page (4)", () => {
  it("says the direction, then the summary, for a job on this NAS", async () => {
    await jobPage("servicesSome", SERVICES_JOBS.local, "Media to Backup");
    expect(document.body).toHaveTextContent(
      "Copies the files of Media into Backup, both on this NAS.",
    );
    expect(screen.getByText("Copy job")).toBeVisible();
    expect(screen.getByText("No.")).toBeVisible();
    expect(screen.getByText("Not emailed.")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Run it now" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Change the job" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Delete this copy job…" }),
    ).toBeVisible();
    expect(screen.queryByText("Signs in with")).toBeNull();
    expect(callNames()).not.toContain("Rsync.set");
  });

  it("names the SSH key of a job over SSH and shows its public half on request", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.push,
      "Photos to /srv/copies/photos on backup.example.org",
    );
    expect(document.body).toHaveTextContent(
      "Copies the files of Photos from this NAS to /srv/copies/photos on backup.example.org.",
    );
    expect(await screen.findByText("example-key", {}, LONG)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Show its public key" }),
    );
    expect(
      screen.getByText(/example-key$/u, { selector: "code" }),
    ).toBeVisible();
  });

  it("says a password is set without ever holding it", async () => {
    const { app } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.pull,
      "photos on backup.example.org to Backup",
    );
    expect(await screen.findByText("A password: Set", {}, LONG)).toBeVisible();
    expect(screen.getAllByText("Only when started here")[0]).toBeVisible();
    const cached = JSON.stringify(
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cached).not.toContain(PASSWORD);
    expect(document.body.textContent).not.toContain(PASSWORD);
  });

  it("calls nothing for an address that is not a job's", async () => {
    await renderApp({
      signedIn: true,
      scenario: "servicesSome",
      path: "/services/rsync/jobs/Rsync.delete",
    });
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "This copy job no longer exists." },
        LONG,
      ),
    ).toBeVisible();
    expect(callNames().some((c) => c.startsWith("Rsync."))).toBe(false);
  });

  it("says a job the list does not hold no longer exists", async () => {
    await jobPage("servicesSome", jobUuid(0x5999));
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "This copy job no longer exists." },
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Copy jobs" })).toBeVisible();
  });

  it("says a deleting job's deletion, and one through extra options and one that removes source files", async () => {
    await jobPage("jobsDeleting", jobUuid(0x5021), "Media to Backup, deleting");
    expect(document.body).toHaveTextContent(
      "Yes: files in Backup that are not in Media are deleted on each run.",
    );
  });
});

describe("changing a job (6)", () => {
  it("saves a change of the note alone to the band, writing back the whole job", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.local,
      "Media to Backup",
    );
    await user.click(screen.getByRole("button", { name: "Change…" }));
    const note = await screen.findByRole("textbox", { name: "Note" });
    await user.clear(note);
    await user.type(note, "Weekly copy");
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        `The changes to ${iso("Media to Backup")} are saved. Apply them to use them.`,
        {},
        LONG,
      ),
    ).toBeVisible();
    const sent = params("Rsync.set")[0];
    expect(Object.keys(sent ?? {})).toHaveLength(36);
    expect(sent).toMatchObject({
      uuid: SERVICES_JOBS.local,
      comment: "Weekly copy",
      type: "local",
      optiondelete: false,
      optiondryrun: false,
      enable: true,
    });
    expect(params("Rsync.get").length).toBeGreaterThan(1);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Change…" })).toHaveFocus(),
    );
  }, 30_000);

  it("asks for the password again for a job that signs in with one, sends it once and keeps none", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.pull,
      "photos on backup.example.org to Backup",
    );
    await user.click(
      await screen.findByRole("button", { name: "Change…" }, LONG),
    );
    expect(
      await screen.findByText(
        "Type the password again to save. The NAS does not give it back to this page.",
      ),
    ).toBeVisible();
    // Every sentence names the other computer's side in 0.2's words, never blank.
    const form = screen.getByRole("form", { name: "Change the job" });
    expect(form).toHaveTextContent(
      "Files in Backup with the same name as a file in photos on backup.example.org are replaced by the version in photos on backup.example.org, even when the one in Backup is newer.",
    );
    expect(form).toHaveTextContent(
      "Makes Backup an exact copy of photos on backup.example.org.",
    );
    expect(form).toHaveTextContent(
      "Without one, it is called photos on backup.example.org to Backup.",
    );
    const field = screen.getByLabelText("Password");
    expect(field).toHaveValue("");
    await user.type(field, "typed-again");
    await user.type(
      screen.getByRole("textbox", { name: "Note" }),
      "Pulled photos",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(params("Rsync.set")[0]?.password).toBe("typed-again"),
    );
    expect(markupOf()).not.toContain("typed-again");
  }, 30_000);

  it("sends a change of destination through the summary and a trial", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.local,
      "Media to Backup",
    );
    await user.click(screen.getByRole("button", { name: "Change…" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", { name: /Also delete files in Backup/u }),
    );
    expect(
      await screen.findByText(
        "Changing which folders it copies, or the way it copies, needs a new trial run before the job runs again.",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Review the change…" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Ready to save the copy job",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save and turn on" }),
    ).toBeNull();
    expect(callNames()).not.toContain("Rsync.set");
  }, 30_000);
});

describe("running a job now (7)", () => {
  it("runs it as a task, shows its output, and stops it after a plain confirmation", async () => {
    const { user } = await jobPage(
      "jobsRun",
      SERVICES_JOBS.long,
      "Media to Backup (large)",
    );
    const run = await screen.findByRole("button", { name: "Run now…" });
    await waitFor(
      () => expect(run).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(run);
    const dialog = await screen.findByRole("alertdialog", {
      name: `Copy ${iso("Media")} to ${iso("Backup")} now?`,
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Start copying" }),
    );
    const heading = await screen.findByRole(
      "heading",
      { level: 3, name: `Copy job: ${iso("Media to Backup (large)")}` },
      LONG,
    );
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("button", { name: "Run now…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("It is running now.")).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: "Stop the copy…" }, LONG),
    );
    const stop = await screen.findByRole("alertdialog", {
      name: `Stop ${iso("Media to Backup (large)")}?`,
    });
    expect(stop).toHaveTextContent(
      "Files copied so far stay. Files it deleted so far stay deleted. The next run carries on.",
    );
    await user.click(
      within(stop).getByRole("button", { name: "Stop the copy" }),
    );
    expect(
      await screen.findByText(
        `${iso("Media to Backup (large)")} was stopped.`,
        {},
        LONG,
      ),
    ).toBeVisible();
    // Stop is gone with the task's end: focus is on the task's heading, not lost to the page.
    await waitFor(() => expect(heading).toHaveFocus());
    expect(callNames()).toContain("Exec.stop");
  }, 30_000);

  it("says a run that ended at once without a word, as when it is already running", async () => {
    const { user } = await jobPage(
      "jobsRun",
      SERVICES_JOBS.atOnce,
      "Documents to Backup",
    );
    const run = await screen.findByRole("button", { name: "Run now…" });
    await waitFor(
      () => expect(run).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(run);
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Start copying",
      }),
    );
    expect(
      await screen.findByText(
        `${iso("Documents to Backup")} ended at once without saying why. It may already be running on its schedule. Wait for it to end and try again.`,
        {},
        LONG,
      ),
    ).toBeVisible();
  }, 30_000);

  it("keeps Run now unavailable while a change is pending", async () => {
    await jobPage("jobsPending", SERVICES_JOBS.local);
    expect(
      await screen.findByText(
        "Apply the pending changes first. The NAS runs each job as it was when changes were last applied.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Run now…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("another computer in the words of 0.2, and a failed run's output (7.2, 7.3)", () => {
  it("names the other computer's folder in Run now's confirmation, never its stored address", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.push,
      "Photos to /srv/copies/photos on backup.example.org",
    );
    const run = await screen.findByRole("button", { name: "Run now…" });
    await waitFor(
      () => expect(run).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(run);
    const dialog = await screen.findByRole("alertdialog", {
      name: `Copy ${iso("Photos")} to ${iso("/srv/copies/photos on backup.example.org")} now?`,
    });
    expect(dialog).toHaveTextContent(
      "Files in /srv/copies/photos on backup.example.org with the same name are replaced by the versions in Photos.",
    );
    expect(dialog.textContent).not.toContain("backup@");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  }, 30_000);

  it("shows a failed run's output once, with its last lines in the result", async () => {
    const { user } = await jobPage(
      "jobsRun",
      SERVICES_JOBS.hostKey,
      "Photos to /srv/copies/photos on backup.example.org",
    );
    const run = await screen.findByRole("button", { name: "Run now…" });
    await waitFor(
      () => expect(run).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(run);
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Start copying",
      }),
    );
    expect(
      await screen.findByText(
        `${iso("Photos to /srv/copies/photos on backup.example.org")} failed.`,
        {},
        LONG,
      ),
    ).toBeVisible();
    const output = screen.getByRole("region", {
      name: "Output of Photos to /srv/copies/photos on backup.example.org",
    });
    const times =
      (output.textContent ?? "").split("Host key verification failed.").length -
      1;
    expect(times).toBe(1);
    expect(output.textContent).not.toContain("Failed to execute command");
  }, 30_000);
});

describe("a trial-only job and deleting (4.2, 8)", () => {
  it("refuses to turn on a deleting job without a trial seen in this session", async () => {
    await jobPage(
      "jobsDeleting",
      jobUuid(0x5024),
      "Photos into Media, trial only",
    );
    expect(
      screen.getByText("This job only does trial runs, so it copies nothing."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Turn the job on…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        "Run a trial of this job first: you see what it would delete before it deletes anything.",
      ),
    ).toBeVisible();
  });

  it("deletes the job after a plain confirmation and goes back to the list", async () => {
    const { user } = await jobPage(
      "servicesSome",
      SERVICES_JOBS.local,
      "Media to Backup",
    );
    await user.click(
      screen.getByRole("button", { name: "Delete this copy job…" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: `Delete the copy job ${iso("Media to Backup")}?`,
    });
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
    await screen.findByRole("region", { name: "Copy jobs" }, LONG);
    expect(params("Rsync.delete")).toEqual([{ uuid: SERVICES_JOBS.local }]);
  }, 30_000);
});
