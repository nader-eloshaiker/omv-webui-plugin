// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page and this slice's settings, on the remembering services mock (phase 5
// services design 2.7, 11.1, 12.1; P14, P19): Used by names the rsync server folder and the copy jobs
// with their links, the delete refuses for an NFS entry, an rsync server folder and each copy job
// with what to do, a failed read fails both closed; the share's recycle bin is shown, set and turned
// off with its warning; emptying it is unavailable with each reason, typed to confirm, and a task
// whose result reads its output.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import {
  SERVICES_FOLDERS,
  SERVICES_JOBS,
  SERVICES_SHARES,
} from "../../mocks/servicesScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15_000 };
const F = SERVICES_FOLDERS;

async function page(
  scenario: ScenarioName,
  uuid: string,
  answers: Answers = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/storage/shared-folders/${uuid}`,
    answers,
  });
  await screen.findByRole(
    "heading",
    { level: 2, name: "Who can use it" },
    LONG,
  );
  return app;
}

const usedBy = () =>
  screen.findByRole("heading", { level: 2, name: "Used by" }, LONG);
const usedByPanel = async () =>
  (await usedBy()).closest("section") as HTMLElement;
const deleteSection = () =>
  screen.getByRole("region", { name: "Delete this shared folder" });
const smb = () =>
  screen.getByRole("region", { name: "Windows and Mac computers" });
const sent = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);

describe("Used by and the delete's blockers (2.7)", () => {
  it("names the rsync server folder and the copy job that copies from it, with their links", async () => {
    await page("servicesSome", F.photos);
    const panel = await usedByPanel();
    await within(panel).findByText("Offered to the rsync server as", {}, LONG);
    expect(panel).toHaveTextContent("photos");
    expect(
      within(panel).getByRole("link", { name: "Open the rsync server" }),
    ).toHaveAttribute("href", "/ui/services/rsync/server");
    expect(within(panel).getByText("Copied by the copy job")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: /^Open the copy job /u }),
    ).toHaveAttribute("href", `/ui/services/rsync/jobs/${SERVICES_JOBS.push}`);
  });

  it("refuses the delete while the rsync server and a copy job use it, saying where to go", async () => {
    await page("servicesSome", F.photos);
    const section = deleteSection();
    await waitFor(
      () =>
        expect(section).toHaveTextContent(
          "It is offered to the rsync server as photos.",
        ),
      LONG,
    );
    expect(
      within(section).getByRole("button", { name: "Remove, keep the files…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(section).getByRole("link", { name: "Open the rsync server" }),
    ).toHaveAttribute("href", "/ui/services/rsync/server");
    expect(section).toHaveTextContent(/The copy job .+ copies from it\./u);
    expect(
      within(section).getByRole("link", { name: /^Open the copy job /u }),
    ).toHaveAttribute("href", `/ui/services/rsync/jobs/${SERVICES_JOBS.push}`);
    expect(section).not.toHaveTextContent("add-on");
  });

  it("refuses for its NFS entries and each job that copies into it, naming a job by its note", async () => {
    await page("servicesSome", F.backup);
    const section = deleteSection();
    expect(
      await within(section).findByText(
        "It is shared with Linux and Unix computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(section).toHaveTextContent(
      "Stop letting every computer in first, above, and apply that change.",
    );
    expect(section).toHaveTextContent(
      /The copy job .?Media to Backup.? copies into it\./u,
    );
    expect(
      within(section).getAllByRole("link", { name: /^Open the copy job /u }),
    ).toHaveLength(2);
    const panel = await usedByPanel();
    expect(
      within(panel).getAllByText("Copied to by the copy job"),
    ).toHaveLength(2);
    expect(panel).toHaveTextContent("Media to Backup");
  });

  it("fails both closed when the copy jobs cannot be read", async () => {
    await page("servicesSome", F.photos, {
      rsyncGetList: { status: 500, message: "Jobs unreadable." },
    });
    const panel = await usedByPanel();
    expect(
      await within(panel).findByText(
        "Could not check what uses this shared folder, so it cannot be removed now.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(within(panel).getByText("Jobs unreadable.")).toBeVisible();
    expect(
      within(deleteSection()).getByRole("button", {
        name: "Remove, keep the files…",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("says an add-on uses it when nothing this interface knows does", async () => {
    await page("servicesSome", F.documents, {
      shareMgmtGetList: ({ params }) => {
        void params;
        const rows = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data;
        return {
          status: 200,
          value: {
            total: 1,
            data: [
              {
                ...rows[0],
                uuid: F.documents,
                name: "Документы",
                _used: true,
              },
            ],
          },
        };
      },
    });
    const panel = await usedByPanel();
    expect(
      await within(panel).findByText(
        "Used by an add-on's setting. Look in the classic interface.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });
});

describe("a share's recycle bin (11.3)", () => {
  it("shows each share's recycle bin among its facts", async () => {
    await page("recycleBin", F.photos);
    expect(
      await within(smb()).findByText("On: files are kept 30 days", {}, LONG),
    ).toBeVisible();
  });

  it("says a bin kept until emptied, and a bin that is off", async () => {
    await page("recycleBin", F.media);
    expect(
      await within(smb()).findByText(
        "On: files are kept until it is emptied",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("turns a bin on with 30 days, refuses days out of range, and writes the share read with getShare", async () => {
    const { user } = await page("recycleBin", F.backup);
    await within(smb()).findByText("Recycle bin", {}, LONG);
    expect(
      within(smb()).queryByRole("button", { name: "Empty the recycle bin…" }),
    ).toBeNull();
    await user.click(
      within(smb()).getByRole("button", { name: "Change options…" }),
    );
    const box = within(smb()).getByRole("checkbox", {
      name: "Keep deleted files in a recycle bin",
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    const days = within(smb()).getByRole("textbox", {
      name: /^Delete files from it after/u,
    });
    expect(days).toHaveValue("30");
    await user.clear(days);
    await user.type(days, "4000");
    await user.tab();
    expect(
      within(smb()).getByText("Use a number of days from 0 to 3650."),
    ).toBeVisible();
    await user.click(within(smb()).getByRole("button", { name: "Save" }));
    expect(callNames()).not.toContain("SMB.setShare");
    await user.clear(days);
    await user.type(days, "14");
    await user.click(within(smb()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("SMB.setShare")).toHaveLength(1));
    expect(sent("SMB.getShare")).toEqual([{ uuid: SERVICES_SHARES.backup }]);
    expect(sent("SMB.setShare")[0]).toMatchObject({
      uuid: SERVICES_SHARES.backup,
      recyclebin: true,
      recyclemaxage: 14,
    });
    expect(sent("SMB.setShare")[0]).not.toHaveProperty("sharedfoldername");
    expect(
      await within(smb()).findByText("On: files are kept 14 days", {}, LONG),
    ).toBeVisible();
  }, 30_000);

  it("warns that files stay when a bin that is on is turned off", async () => {
    const { user } = await page("recycleBin", F.photos);
    await user.click(
      await within(smb()).findByRole(
        "button",
        { name: "Change options…" },
        LONG,
      ),
    );
    await user.click(
      within(smb()).getByRole("checkbox", {
        name: "Keep deleted files in a recycle bin",
      }),
    );
    await waitFor(() =>
      expect(smb()).toHaveTextContent(
        /Files already in the recycle bin stay in the hidden folder \.recycle inside .?Photos.?, using space\./u,
      ),
    );
  });
});

describe("emptying a recycle bin (11.4)", () => {
  const info = (dirty: Record<string, string>) => {
    const base = CONTRACT_EXAMPLES.systemGetInformation.admin.value;
    return { status: 200, value: { ...base, dirtyModules: dirty } };
  };

  it("asks for the folder's name typed, then shows the task's output and result", async () => {
    const { user } = await page("recycleBin", F.photos);
    await user.click(
      await within(smb()).findByRole(
        "button",
        { name: "Empty the recycle bin…" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: /^Empty the recycle bin of .?Photos.?\?$/u,
    });
    expect(dialog).toHaveTextContent(
      "Every file in it is deleted for good, for every person, however recently it was deleted.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    const confirm = within(dialog).getByRole("button", {
      name: "Empty recycle bin",
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(within(dialog).getByRole("textbox"), "photos");
    await user.click(confirm);
    expect(callNames()).not.toContain("SMB.emptyRecycleBin");
    await user.clear(within(dialog).getByRole("textbox"));
    await user.type(within(dialog).getByRole("textbox"), "Photos");
    await user.click(confirm);
    // Focus moves to the task's heading, not back to the button (as 7.3).
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 4,
          name: /^Emptying the recycle bin of /u,
        }),
      ).toHaveFocus(),
    );
    expect(
      await screen.findByText(
        /^The recycle bin of .?Photos.? is empty\.$/u,
        {},
        { timeout: 20_000 },
      ),
    ).toBeVisible();
    expect(sent("SMB.emptyRecycleBin")).toEqual([
      { uuid: SERVICES_SHARES.photos },
    ]);
    const output = screen.getByRole("region", {
      name: /^Output of emptying the recycle bin of /u,
    });
    expect(output).toHaveTextContent("removed directory");
    // The handle is never in the page (UI-5).
    expect(markupOf()).not.toContain("/tmp/bgstatus");
  }, 40_000);

  it("says nothing was deleted when the output lists nothing removed", async () => {
    const { user } = await page("recycleBin", F.media);
    await user.click(
      await within(smb()).findByRole(
        "button",
        { name: "Empty the recycle bin…" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Media");
    await user.click(
      within(dialog).getByRole("button", { name: "Empty recycle bin" }),
    );
    expect(
      await screen.findByText(
        "Nothing was deleted. The recycle bin was empty, or the NAS was emptying it already.",
        {},
        { timeout: 20_000 },
      ),
    ).toBeVisible();
  }, 40_000);

  it("shows OMV's refusal when the task fails", async () => {
    const { user } = await page("recycleBin", F.photos, {
      smbEmptyRecycleBin: "pending",
    });
    await user.click(
      await within(smb()).findByRole(
        "button",
        { name: "Empty the recycle bin…" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), "Photos");
    await user.click(
      within(dialog).getByRole("button", { name: "Empty recycle bin" }),
    );
    expect(
      await screen.findByText(
        /^The recycle bin of .?Photos.? could not be emptied\.$/u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Please apply the configuration changes first."),
    ).toBeVisible();
  }, 30_000);

  it.each([
    {
      why: "samba is pending",
      answers: {
        systemGetInformation: info({ samba: "Samba" }),
      } as Answers,
      reason: "Apply the pending changes first.",
    },
    {
      why: "Windows and Mac sharing is off",
      answers: { smbGetSettings: "off" } as Answers,
      reason: "Windows and Mac sharing is off, so the NAS cannot empty it now.",
    },
  ])("is unavailable while $why", async ({ answers, reason }) => {
    const { user } = await page("recycleBin", F.photos, answers);
    const button = await within(smb()).findByRole(
      "button",
      { name: "Empty the recycle bin…" },
      LONG,
    );
    expect(await within(smb()).findByText(reason, {}, LONG)).toBeVisible();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("is unavailable while this page's bin change is not applied", async () => {
    const { user } = await page("recycleBin", F.photos);
    await user.click(
      await within(smb()).findByRole(
        "button",
        { name: "Change options…" },
        LONG,
      ),
    );
    const days = within(smb()).getByRole("textbox", {
      name: /^Delete files from it after/u,
    });
    await user.clear(days);
    await user.type(days, "7");
    await user.click(within(smb()).getByRole("button", { name: "Save" }));
    expect(
      await within(smb()).findByText(
        "The recycle bin is not applied yet.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(smb()).getByRole("button", { name: "Empty the recycle bin…" }),
    ).toHaveAttribute("aria-disabled", "true");
  }, 30_000);
});
