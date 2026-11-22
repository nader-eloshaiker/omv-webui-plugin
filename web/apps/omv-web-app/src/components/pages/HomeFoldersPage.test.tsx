// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Settings, "Home folders" (phase 5 users design 12) through the whole app on MSW: the states
// of 12.7, which shared folders are offered and why the others are not (a whole file system never,
// change 10 of the test VM), turning them on (the re-read, the request, the toast, the pending mark)
// and off (the folder kept), a refused and a cut request, hostile names as text, and a normal user
// kept off the page without a call (UI-4). The shares stories give the folders; the setting is
// answered here until the users stories are ready.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames } from "../../test/server.ts";
import {
  calls,
  folderUuid,
  LONG,
  paramsOf,
} from "../../test/sharedFolderPage.ts";

const PHOTOS = folderUuid(1);
const BACKUPS = folderUuid(3);
const OFF = { status: 200, value: { enable: false, sharedfolderref: "" } };
const onIn = (uuid: string) => ({
  status: 200,
  value: { enable: true, sharedfolderref: uuid },
});

async function homePage(
  scenario: ScenarioName = "sharesSome",
  answers: Answers = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/usermgmt/settings",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Home folders" }, LONG);
  return app;
}

/** A setting that remembers what setSettings sent, as OMV does. */
function rememberingSetting(first: {
  enable: boolean;
  sharedfolderref: string;
}) {
  let now = first;
  return {
    userMgmtGetSettings: () => ({ status: 200, value: now }),
    userMgmtSetSettings: ({ params }: { params: unknown }) => {
      now = params as typeof now;
      return { status: 200, value: now };
    },
  } satisfies Answers;
}

const stateLine = () =>
  screen
    .getByText(/Home folders are off|Each person has|Home folders are on/)
    .closest("p") as HTMLElement;

describe("the home folders page: states (12.7)", () => {
  it("is loading before the setting is read", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesSome",
      path: "/usermgmt/settings",
    });
    expect(
      await screen.findByText("Loading the home folders setting…", {}, LONG),
    ).toBeInTheDocument();
    await screen.findByText(/Home folders are off/, {}, LONG);
  });

  it("says when the setting could not be read, with no button", async () => {
    await homePage("sharesSome", {
      userMgmtGetSettings: { status: 500, message: "Database locked." },
    });
    expect(
      await screen.findByText(
        "Could not read whether home folders are on.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Database locked.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Turn (on|off) home folders/ }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing when the file systems could not be read (fail closed)", async () => {
    await homePage("sharesSome", {
      fileSystemMgmtGetList: { status: 500, message: "Disks unreadable." },
    });
    expect(
      await screen.findByText("Could not read the file systems.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText("Disks unreadable.")).toBeVisible();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on home folders…" }),
    ).not.toBeInTheDocument();
  });

  it("is on in a shared folder that no longer exists: Unknown, and the off button only", async () => {
    await homePage("sharesSome", {
      userMgmtGetSettings: onIn("00000000-0000-4000-8000-0000000002ff"),
    });
    expect(
      await screen.findByText(
        "Home folders are on, but their shared folder no longer exists.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(within(stateLine()).getByText("Unknown")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Turn off home folders…" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", {
        name: "User settings in the classic interface (opens in a new tab)",
      }),
    ).not.toBeInTheDocument();
  });

  it("is on in a folder, with its link, the move line and the classic link", async () => {
    await homePage("sharesSome", { userMgmtGetSettings: onIn(PHOTOS) });
    await screen.findByText(
      /Each person has a private home folder in/,
      {},
      LONG,
    );
    expect(
      within(stateLine()).getByRole("link", {
        name: "Open shared folder Photos",
      }),
    ).toHaveAttribute("href", `/ui/storage/shared-folders/${PHOTOS}`);
    expect(
      screen.getByText(/To stop using home folders, turn them off\./),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /User settings in the classic interface/,
      }),
    ).toHaveAttribute("href", "/#/usermgmt/settings");
    // SMB is on in this story, and does not share home folders.
    expect(
      screen.getByText(/Windows and Mac computers can open home folders: no\./),
    ).toBeVisible();
  });

  it("says when the folder that holds them cannot be reached", async () => {
    await homePage("sharesBroken", {
      userMgmtGetSettings: onIn(folderUuid(3)),
    });
    expect(
      await screen.findByText(
        "People cannot reach their home folders.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });
});

describe("which shared folders may hold them (12.4)", () => {
  it("offers OK folders, none chosen, and lists the others with their reasons", async () => {
    const { user } = await homePage("sharesWholeFs");
    const group = await screen.findByRole(
      "radiogroup",
      { name: "Shared folder for home folders" },
      LONG,
    );
    const options = within(group).getAllByRole("radio");
    expect(options.map((o) => o.closest("label")?.textContent)).toEqual([
      "Media",
      "Movies",
    ]);
    for (const option of options) {
      expect(option).not.toBeChecked();
    }
    // A whole file system is never offered (the test VM, change 10).
    expect(within(group).queryByText("Archive")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Shared folder that cannot hold home folders (1)",
      }),
    );
    expect(screen.getByText(/It is the whole file system/)).toBeVisible();
  });

  it("says so when no shared folder may hold them, and leads to adding one", async () => {
    await homePage("sharesNone");
    expect(
      await screen.findByText(
        "No shared folder can hold home folders yet.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Add a shared folder for home folders",
      }),
    ).toHaveAttribute("href", "/ui/storage/shared-folders/add");
  });

  it("asks for a folder before it asks to confirm", async () => {
    const { user } = await homePage("sharesSome");
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Turn on home folders…" },
        LONG,
      ),
    );
    expect(
      screen.getByText("Choose the shared folder for home folders."),
    ).toBeVisible();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows hostile folder names as text", async () => {
    await homePage("sharesHostile");
    const group = await screen.findByRole("radiogroup", {}, LONG);
    expect(within(group).getByText("<b>x</b>")).toBeVisible();
    expect(group.querySelector("b")).toBeNull();
  });
});

describe("turning them on (12.5)", () => {
  it("confirms plainly, re-reads, sends the folder, and marks the change pending", async () => {
    const { user } = await homePage("sharesSome", {
      // The story's own setSettings marks Windows and Mac sharing pending, as OMV does.
      userMgmtGetSettings: () =>
        calls("UserMgmt.setSettings").length > 0 ? onIn(BACKUPS) : OFF,
    });
    const group = await screen.findByRole("radiogroup", {}, LONG);
    await user.click(within(group).getByRole("radio", { name: "Backups" }));
    await user.click(
      screen.getByRole("button", { name: "Turn on home folders…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/^Turn on home folders in .?Backups.?\?$/),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        /A private folder named after each person is made in/,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "If a person already has a home folder elsewhere, its files are moved into the new one.",
      ),
    ).toBeVisible();
    // A plain confirmation: focus starts on Cancel.
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    const before = callNames().length;
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    await waitFor(
      () => expect(calls("UserMgmt.setSettings")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("UserMgmt.setSettings")[0]).toEqual({
      enable: true,
      sharedfolderref: BACKUPS,
    });
    // Read again first: the setting, the folders and the file systems.
    const sent = callNames().slice(before);
    expect(sent.indexOf("UserMgmt.getSettings")).toBeLessThan(
      sent.indexOf("UserMgmt.setSettings"),
    );
    expect(sent).toContain("ShareMgmt.getList");
    expect(sent).toContain("FileSystemMgmt.getList");
    expect(
      await screen.findByText(
        /^Home folders are on, in .?Backups.?\.$/,
        {},
        LONG,
      ),
    ).toBeVisible();
    await screen.findByText(
      /Each person has a private home folder in/,
      {},
      LONG,
    );
    // The mark follows the pending-changes read, which can come with the next poll (about 5 s);
    // a busy machine needs more than LONG for it.
    await waitFor(
      () =>
        expect(within(stateLine()).getByText("Not applied yet")).toBeVisible(),
      { timeout: 30_000 },
    );
  }, 60000);

  it("keeps the dialog with the server's words when it fails", async () => {
    const { user } = await homePage("sharesSome", {
      userMgmtSetSettings: { status: 500, message: "usermod failed." },
    });
    const group = await screen.findByRole("radiogroup", {}, LONG);
    await user.click(within(group).getByRole("radio", { name: "Photos" }));
    await user.click(
      screen.getByRole("button", { name: "Turn on home folders…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    expect(
      await within(dialog).findByText("usermod failed.", {}, LONG),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "Some home folders may already be set up. Turning them on again finishes the rest.",
      ),
    ).toBeVisible();
  });

  it("cannot tell after a cut request, and checks again", async () => {
    let on = false;
    const { user } = await homePage("sharesSome", {
      userMgmtGetSettings: () => (on ? onIn(PHOTOS) : OFF),
      userMgmtSetSettings: () => {
        on = true;
        return { status: 504, message: "Gateway Timeout" };
      },
    });
    const group = await screen.findByRole("radiogroup", {}, LONG);
    await user.click(within(group).getByRole("radio", { name: "Photos" }));
    await user.click(
      screen.getByRole("button", { name: "Turn on home folders…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    expect(
      await within(dialog).findByText(
        "Could not tell whether home folders were turned on.",
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Check again" }),
    );
    expect(
      await screen.findByText(
        /^Home folders are on, in .?Photos.?\.$/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("UserMgmt.setSettings")).toHaveLength(1);
  });

  it("stops when the setting changed since the page read it", async () => {
    let elsewhere = false;
    const { user } = await homePage("sharesSome", {
      userMgmtGetSettings: () => (elsewhere ? onIn(PHOTOS) : OFF),
    });
    const group = await screen.findByRole("radiogroup", {}, LONG);
    await user.click(within(group).getByRole("radio", { name: "Backups" }));
    await user.click(
      screen.getByRole("button", { name: "Turn on home folders…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    elsewhere = true;
    await user.click(within(dialog).getByRole("button", { name: "Turn on" }));
    expect(
      await screen.findByText(
        "Home folders were changed elsewhere since you opened this page.",
        {},
        LONG,
      ),
    ).toBeVisible();
    // The page shows the setting as it is now.
    expect(
      await screen.findByText(
        /Each person has a private home folder in/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("UserMgmt.setSettings")).toHaveLength(0);
  });
});

describe("turning them off (12.6)", () => {
  it("confirms plainly and keeps the folder for next time", async () => {
    const { user } = await homePage(
      "sharesSome",
      rememberingSetting(onIn(PHOTOS).value),
    );
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Turn off home folders…" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Turn off home folders?")).toBeVisible();
    expect(
      within(dialog).getByText(/The folders and every file in them stay in/),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "Programs that keep files in a person's home folder, such as an add-on, stop finding them.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    await waitFor(
      () => expect(calls("UserMgmt.setSettings")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("UserMgmt.setSettings")[0]).toEqual({
      enable: false,
      sharedfolderref: PHOTOS,
    });
    expect(
      await screen.findByText(
        /^Home folders are off\. Their files are still in .?Photos.?\.$/,
        {},
        LONG,
      ),
    ).toBeVisible();
    await screen.findByText(/Home folders are off\. People have no/, {}, LONG);
    // Turning them on again offers the same folder first.
    const group = await screen.findByRole("radiogroup", {}, LONG);
    expect(
      within(group).getAllByRole("radio")[0]?.closest("label")?.textContent,
    ).toBe("Photos");
  });
});

describe("a normal user", () => {
  it("gets the administrators-only page, and nothing is read", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/usermgmt/settings",
    });
    expect(
      await screen.findByRole(
        "heading",
        { level: 1, name: "Home folders" },
        LONG,
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("UserMgmt.getSettings");
  });
});
