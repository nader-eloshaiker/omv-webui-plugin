// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page and the home folders (phase 5 users design 13.1): while it holds them, Used
// by names "Home folders of every person" with a link to the home-folders page, and deleting it is
// refused with "Turn home folders off first."; another folder says nothing of them.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { folderPage, folderUuid, LONG } from "../../test/sharedFolderPage.ts";

const MEDIA = folderUuid(1);
const holdsMedia = {
  answers: {
    userMgmtGetSettings: {
      status: 200,
      value: { enable: true, sharedfolderref: MEDIA },
    },
  },
};
const keepButton = () =>
  screen.getByRole("button", { name: "Remove, keep the files…" });

describe("a shared folder that holds the home folders (13.1)", () => {
  it("names them under Used by, with a link to the setting", async () => {
    await folderPage("sharesWholeFs", MEDIA, holdsMedia);
    const panel = (
      await screen.findByRole("heading", { level: 2, name: "Used by" }, LONG)
    ).closest("section") as HTMLElement;
    expect(within(panel).getByText("Home folders")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "Home folders of every person" }),
    ).toHaveAttribute("href", "/ui/usermgmt/settings");
  });

  it("refuses to delete it until home folders are off", async () => {
    await folderPage("sharesWholeFs", MEDIA, holdsMedia);
    await waitFor(
      () => expect(keepButton()).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    const section = screen.getByRole("region", {
      name: "Delete this shared folder",
    });
    expect(
      within(section).getByText(
        "It holds every person's home folder. Turn home folders off first.",
      ),
    ).toBeVisible();
    expect(
      within(section).getByRole("link", {
        name: "Open the home folders setting",
      }),
    ).toHaveAttribute("href", "/ui/usermgmt/settings");
  });

  it("says nothing of them on another folder", async () => {
    await folderPage("sharesWholeFs", folderUuid(2), holdsMedia);
    await waitFor(
      () => expect(keepButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(
      screen.queryByText("Home folders of every person"),
    ).not.toBeInTheDocument();
  });
});
