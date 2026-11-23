// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a copy job", through the whole app on the remembering services mock (phase 5 services design
// 5): the pre-flight while changes are pending (R1), the form's refusals, the summary with only "Save
// and try it" for a job that deletes, the steps, the trial's result read from its output, turning the
// job on with the destination's name typed (UI-8), "Save and turn on" for a job that does not delete,
// a failed save, and a shared folder's page handing its folder over in memory (12.1).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { SERVICES_FOLDERS } from "../../mocks/servicesScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

/** A name as the interface puts it in a sentence: isolated (format/isolate.ts). */
const iso = (name: string) => `\u2068${name}\u2069`;
const LONG = { timeout: 20_000 };

async function addPage(scenario: ScenarioName) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/services/rsync/jobs/add",
  });
  await screen.findByRole(
    "heading",
    { level: 1, name: "Add a copy job" },
    LONG,
  );
  return app;
}
const params = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);

type User = Awaited<ReturnType<typeof addPage>>["user"];

async function chooseFolder(user: User, index: 0 | 1, name: string) {
  const select = await waitFor(() => {
    const all = screen.getAllByRole("combobox", { name: "Shared folder" });
    const one = all[index];
    expect(one).not.toHaveAttribute("aria-disabled", "true");
    return one;
  }, LONG);
  if (select === undefined) {
    throw new Error("no select");
  }
  await user.click(select);
  await user.click(
    await screen.findByRole("option", { name: new RegExp(`^${name}`, "u") }),
  );
}

describe("adding a copy job (5)", () => {
  it("refuses the same folder on both sides before anything is saved", async () => {
    const { user } = await addPage("jobsTrial");
    await chooseFolder(user, 0, "Photos");
    await chooseFolder(user, 1, "Photos");
    await user.click(screen.getByRole("button", { name: "Review the job…" }));
    expect(
      await screen.findByText("Choose two different folders."),
    ).toBeVisible();
    expect(callNames()).not.toContain("Rsync.set");
  }, 30_000);

  it("tries a job that deletes, reads its trial, and turns it on with the destination's name typed", async () => {
    const { user } = await addPage("jobsTrial");
    await chooseFolder(user, 0, "Photos");
    await chooseFolder(user, 1, "Backup");
    await user.click(
      screen.getByRole("checkbox", { name: /Also delete files in Backup/u }),
    );
    expect(
      screen.getByText(
        "So the job is saved for trial runs only. You see what it would delete before it deletes anything.",
      ),
    ).toBeVisible();
    // Field 3, the direction (a polite live region), follows 500 ms after the last change.
    const form = screen.getByRole("form", { name: "Add a copy job" });
    await waitFor(() => {
      const direction = within(form)
        .getAllByRole("status")
        .find((r) => r.textContent?.includes("Copies the files of Photos"));
      expect(direction).toHaveTextContent(
        "Copies the files of Photos into Backup, both on this NAS.",
      );
      // The line above the sentence says the direction in words too.
      expect(direction).toHaveTextContent(/^From\s*Photos\s*To\s*Backup/u);
    });
    expect(
      within(form).queryByText("Choose both sides to see what this job does."),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Review the job…" }));
    const summary = await screen.findByRole("region", {
      name: "Ready to save the copy job",
    });
    expect(summary).toHaveTextContent(
      "Copies the files of Photos into Backup, both on this NAS.",
    );
    expect(summary).toHaveTextContent(
      "Also deletes files in Backup that are not in Photos.",
    );
    expect(
      within(summary).queryByRole("button", { name: "Save and turn on" }),
    ).toBeNull();
    expect(callNames()).not.toContain("Rsync.set");
    await user.click(
      within(summary).getByRole("button", { name: "Save and try it" }),
    );

    expect(
      await screen.findByText(
        "The trial run finished. Nothing was changed.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(document.body).toHaveTextContent("It would copy 20 files.");
    expect(document.body).toHaveTextContent(
      "It would delete 12 files from Backup.",
    );
    expect(document.body).toHaveTextContent("old-copies/file-12.txt");
    const saved = params("Rsync.set")[0];
    expect(saved).toMatchObject({
      optiondryrun: true,
      enable: false,
      optiondelete: true,
      srcsharedfolderref: SERVICES_FOLDERS.photos,
      destsharedfolderref: SERVICES_FOLDERS.backup,
    });
    expect(Object.keys(saved ?? {})).toHaveLength(36);
    expect(callNames()).toContain("Config.applyChangesBg");
    expect(callNames()).toContain("Rsync.execute");

    await user.click(screen.getByRole("button", { name: "Turn the job on…" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: `Turn on ${iso("Photos to Backup")}, which deletes files in ${iso("Backup")}?`,
    });
    expect(dialog).toHaveTextContent("The trial run listed 12 such files now.");
    const confirm = within(dialog).getByRole("button", {
      name: "Turn on and delete",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(within(dialog).getByRole("textbox"), "Backup");
    await user.click(confirm);
    expect(
      await screen.findByText(
        new RegExp(`^${iso("Photos to Backup")} is on\\.`, "u"),
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(params("Rsync.set")[1]).toMatchObject({
      optiondryrun: false,
      enable: true,
    });
  }, 60_000);

  it("saves and turns on a job that does not delete, without a trial", async () => {
    const { user } = await addPage("jobsTrial");
    await chooseFolder(user, 0, "Photos");
    await chooseFolder(user, 1, "Media");
    await user.click(screen.getByRole("button", { name: "Review the job…" }));
    const summary = await screen.findByRole("region", {
      name: "Ready to save the copy job",
    });
    await user.click(
      within(summary).getByRole("button", { name: "Save and turn on" }),
    );
    expect(
      await screen.findByText("The job is saved and on.", {}, LONG),
    ).toBeVisible();
    expect(params("Rsync.set")[0]).toMatchObject({
      optiondryrun: false,
      enable: true,
    });
    expect(callNames()).not.toContain("Rsync.execute");
  }, 30_000);

  it("says the job was not saved, with the server's message", async () => {
    const { user } = await addPage("jobsAddFailsSave");
    await chooseFolder(user, 0, "Photos");
    await chooseFolder(user, 1, "Backup");
    await user.click(screen.getByRole("button", { name: "Review the job…" }));
    await user.click(
      within(
        await screen.findByRole("region", {
          name: "Ready to save the copy job",
        }),
      ).getByRole("button", { name: "Save and try it" }),
    );
    expect(
      await screen.findByText("The job was not saved.", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Try this step again" }),
    ).toBeVisible();
    expect(document.body.textContent).not.toContain("mock trace");
  }, 30_000);

  it("stops at the pre-flight while other changes are pending (R1)", async () => {
    await addPage("jobsPending");
    expect(
      await screen.findByText(
        "Adding a copy job applies its own changes, so deal with those first.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });
});

describe("from a shared folder's page (12.1)", () => {
  it("opens the add flow with the folder chosen as the source, handed over in memory", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "servicesSome",
      path: `/storage/shared-folders/${SERVICES_FOLDERS.photos}`,
    });
    const link = await screen.findByRole(
      "link",
      { name: "Keep a copy of this folder…" },
      LONG,
    );
    expect(link.getAttribute("href")).toBe("/ui/services/rsync/jobs/add");
    await user.click(link);
    await screen.findByRole(
      "heading",
      { level: 1, name: "Add a copy job" },
      LONG,
    );
    await waitFor(
      () =>
        expect(
          screen.getAllByRole("combobox", { name: "Shared folder" })[0],
        ).toHaveTextContent("Photos"),
      LONG,
    );
    expect(window.location.search).toBe("");
  }, 30_000);
});
