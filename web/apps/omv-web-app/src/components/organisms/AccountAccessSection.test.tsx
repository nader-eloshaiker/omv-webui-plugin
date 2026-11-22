// SPDX-License-Identifier: GPL-3.0-or-later
// "Shared folders" for one person or group (phase 5 users design 4.2, 9.5), mounted where the pages
// mount it, on the remembering users mock: in "choose" mode (the add flow) the group lines follow the
// flow's ticks and nothing is written; in "save" mode a group's rows say how many members have their
// own entry, a failed write says which folders were saved and which were not with "Try again" for the
// rest, and the folder page's own pending mark follows a save made here.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { USERS_FOLDERS } from "../../mocks/usersScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { calls, LONG, paramsOf } from "../../test/sharedFolderPage.ts";

const section = () =>
  screen
    .getByRole("heading", { name: "Shared folders" })
    .closest("section") as HTMLElement;
const rowOf = (folder: string) =>
  within(section()).getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${folder}.?$`),
  });
const rowText = (folder: string) =>
  (rowOf(folder).closest("[role=row]") as HTMLElement).textContent ?? "";

describe("choose mode (an add flow)", () => {
  it("starts every folder at No access, follows the ticked groups, and writes nothing", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/users/add",
    });
    await screen.findByRole("heading", { name: "Shared folders" }, LONG);
    await within(section()).findByRole(
      "radiogroup",
      { name: /Access for .?Photos.?/ },
      LONG,
    );
    expect(
      within(rowOf("Photos")).getByRole("radio", { name: "No access" }),
    ).toBeChecked();
    expect(rowText("Photos")).not.toMatch(/as a member of/);
    await user.click(screen.getByRole("checkbox", { name: /family/ }));
    await waitFor(() =>
      expect(rowText("Photos")).toMatch(
        /Also gets Read and write as a member of .?family.?\./,
      ),
    );
    expect(
      within(section()).queryByRole("button", { name: "Save access" }),
    ).toBeNull();
    await user.click(
      within(rowOf("Backups")).getByRole("radio", { name: "Read and write" }),
    );
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
  });
});

describe("save mode", () => {
  it("says, on a group's page, how many members have their own entry", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/groups/family",
    });
    await within(
      await screen
        .findByRole("heading", { name: "Shared folders" }, LONG)
        .then((h) => h.closest("section") as HTMLElement),
    ).findByRole("radiogroup", { name: /Access for .?Documents.?/ }, LONG);
    expect(rowText("Documents")).toMatch(
      /1 member also has their own access to this folder\./,
    );
  });

  it("saves the folders it can, says which it could not, and tries only those again", async () => {
    let n = 0;
    const { user } = await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/users/sam",
      answers: {
        shareMgmtSetPrivileges: () => {
          n += 1;
          return n === 2
            ? { status: 500, message: "The folder could not be written." }
            : "saved";
        },
      },
    });
    await screen.findByRole("heading", { level: 2, name: "Password" }, LONG);
    await within(section()).findByRole(
      "radiogroup",
      { name: /Access for .?Backups.?/ },
      LONG,
    );
    await user.click(
      within(rowOf("Backups")).getByRole("radio", { name: "Read only" }),
    );
    await user.click(
      within(rowOf("Homes")).getByRole("radio", { name: "Read only" }),
    );
    await user.click(
      within(section()).getByRole("button", { name: "Save access" }),
    );
    expect(
      await within(section()).findByText(
        /Access to .?Backups.? saved\. Access to .?Homes.? could not be saved: The folder could not be written\./,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("ShareMgmt.setPrivileges").map((p) => p.uuid)).toEqual([
      USERS_FOLDERS.backups,
      USERS_FOLDERS.homes,
    ]);
    await user.click(
      within(section()).getByRole("button", { name: "Try again" }),
    );
    await waitFor(
      () => expect(calls("ShareMgmt.setPrivileges")).toHaveLength(3),
      LONG,
    );
    expect(paramsOf("ShareMgmt.setPrivileges")[2]?.uuid).toBe(
      USERS_FOLDERS.homes,
    );
  });
});
