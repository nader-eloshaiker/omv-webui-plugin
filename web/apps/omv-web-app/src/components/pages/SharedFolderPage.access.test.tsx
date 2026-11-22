// SPDX-License-Identifier: GPL-3.0-or-later
// "Who can use it" on a shared folder's page, on the remembering shares mock (phase 5 shares design 3;
// 0.4, 0.9, 0.10; D9, D10): a change saved without a confirmation, with the whole list and the pending
// mark; discarding; the last access refused while it is shared with guest access off; the list changed
// elsewhere stopping the save; entries for accounts no longer listed said and dropped; Blocked kept.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  calls,
  folderPage,
  LONG,
  paramsOf,
  PHOTOS,
} from "../../test/sharedFolderPage.ts";

const row = (name: string) =>
  screen.getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${name}.?$`),
  });
const choose = (name: string, access: string) =>
  within(row(name)).getByRole("radio", { name: access });

describe("saving access (3.3)", () => {
  it("saves the whole list, keeps focus on Save access and marks the section pending", async () => {
    const { user } = await folderPage("sharesSome");
    const save = await screen.findByRole(
      "button",
      { name: "Save access" },
      LONG,
    );
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Nothing to save.")).toBeVisible();

    await user.click(choose("robin", "Read only"));
    expect(screen.getByText("Changed")).toBeVisible();
    expect(
      await screen.findByText("1 change not saved.", {}, LONG),
    ).toBeVisible();

    await user.click(save);
    await waitFor(
      () => expect(calls("ShareMgmt.setPrivileges")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("ShareMgmt.setPrivileges")[0]).toEqual({
      uuid: PHOTOS,
      privileges: [
        { type: "user", name: "alex", perms: 7 },
        { type: "user", name: "robin", perms: 5 },
        { type: "user", name: "sam", perms: 5 },
      ],
    });
    expect(
      (await screen.findAllByText(/Access to .Photos. saved\./, {}, LONG))
        .length,
    ).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save access" }),
      ).toHaveAttribute("aria-disabled", "true"),
    );
    expect(screen.getByRole("button", { name: "Save access" })).toHaveFocus();
    const heading = screen.getByRole("heading", {
      level: 2,
      name: /Who can use it/,
    });
    await waitFor(
      () => expect(heading.parentElement).toHaveTextContent("Not applied yet"),
      LONG,
    );
    expect(choose("robin", "Read only")).toBeChecked();
  });

  it("discards the changes", async () => {
    const { user } = await folderPage("sharesSome");
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(choose("alex", "No access"));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(choose("alex", "Read and write")).toBeChecked();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
  });

  it("refuses to take the last access away while it is shared with guest access off", async () => {
    const { user } = await folderPage("sharesSome");
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(choose("alex", "No access"));
    await user.click(choose("sam", "No access"));
    await user.click(screen.getByRole("button", { name: "Save access" }));
    expect(
      await screen.findByText(
        /is shared with Windows and Mac computers, so at least one person or group must keep access/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
    // The changes are kept.
    expect(choose("alex", "No access")).toBeChecked();
  });

  it("stops when the list was changed elsewhere, and carries the changes onto the current one", async () => {
    const { user, mock } = await folderPage("sharesSome");
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(choose("robin", "Read only"));
    // Another administrator gives sam Read and write meanwhile.
    const photos = mock.shares?.config.folders.find((f) => f.uuid === PHOTOS);
    expect(photos).toBeDefined();
    photos?.privileges.splice(1, 1, { type: "user", name: "sam", perms: 7 });

    await user.click(screen.getByRole("button", { name: "Save access" }));
    expect(
      await screen.findByText(
        /was changed elsewhere since you opened this page/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(0);
    // Until shown, the grid stays as it was opened.
    expect(choose("sam", "Read only")).toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Show the current access" }),
    );
    expect(choose("sam", "Read and write")).toBeChecked();
    expect(choose("robin", "Read only")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(
      () => expect(calls("ShareMgmt.setPrivileges")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("ShareMgmt.setPrivileges")[0]?.privileges).toContainEqual({
      type: "user",
      name: "sam",
      perms: 7,
    });
  });

  it("shows the server's words when the save fails, keeping every change", async () => {
    const { user } = await folderPage("sharesSome", PHOTOS, {
      answers: {
        shareMgmtSetPrivileges: {
          status: 500,
          message: "The user 'robin' does not exist.",
        },
      },
    });
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(choose("robin", "Read and write"));
    await user.click(screen.getByRole("button", { name: "Save access" }));
    expect(
      await screen.findByText("The user 'robin' does not exist.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText("Access was not saved.")).toBeVisible();
    expect(choose("robin", "Read and write")).toBeChecked();
  });
});

describe("what the grid shows (3.2, 0.4)", () => {
  it("says which stale entries go on save, and keeps a Blocked entry", async () => {
    const { user } = await folderPage("sharesStale");
    expect(
      await screen.findByText(
        /2 entries for accounts that are not on this list will be removed when you save: .old-user., .old-team.\./,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(choose("alex", "Blocked")).toBeChecked();
    expect(
      screen.getByText(/Blocked: cannot open it, even through .family.\./),
    ).toBeVisible();
    // Blocked is offered only where it is stored.
    expect(
      within(row("sam")).queryByRole("radio", { name: "Blocked" }),
    ).not.toBeInTheDocument();

    await user.click(choose("sam", "Read and write"));
    await user.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(
      () => expect(calls("ShareMgmt.setPrivileges")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("ShareMgmt.setPrivileges")[0]?.privileges).toEqual([
      { type: "group", name: "family", perms: 7 },
      { type: "user", name: "alex", perms: 0 },
      { type: "user", name: "sam", perms: 7 },
    ]);
  });

  it("says when there are no people and no groups", async () => {
    await folderPage("sharesNoUsers", PHOTOS);
    expect(
      await screen.findByText(
        /There are no user accounts on this NAS yet, apart from the administrator/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Users in the classic interface/ }),
    ).toBeVisible();
  });

  it("says the lists could not be read, and offers no save", async () => {
    await folderPage("sharesSome", PHOTOS, {
      answers: {
        userMgmtGetUserList: { status: 500, message: "Directory unreachable." },
      },
    });
    expect(
      await screen.findByText(
        "Could not read the people and groups on this NAS.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Directory unreachable.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Save access" }),
    ).not.toBeInTheDocument();
  });
});
