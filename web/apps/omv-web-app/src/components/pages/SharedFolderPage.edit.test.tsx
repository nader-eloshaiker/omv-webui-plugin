// SPDX-License-Identifier: GPL-3.0-or-later
// Editing on a shared folder's page, on the remembering shares mock (phase 5 shares design 2.6, 2.8,
// 7): the description in place (Enter saves, Escape cancels, focus back to Edit), Refresh and leaving
// asking first while the grid holds changes, and pointing a broken folder somewhere else with mode 770.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  calls,
  folderPage,
  folderUuid,
  LONG,
  paramsOf,
  PHOTOS,
} from "../../test/sharedFolderPage.ts";

const row = (name: string) =>
  screen.getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${name}.?$`),
  });

describe("the description (2.6)", () => {
  it("saves on Enter with the row's fields, and focus goes back to Edit", async () => {
    const { user } = await folderPage("sharesSome");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Description" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("Family photos");
    await user.clear(field);
    await user.type(field, "Holidays{Enter}");
    await waitFor(() => expect(calls("ShareMgmt.set")).toHaveLength(1), LONG);
    expect(paramsOf("ShareMgmt.set")[0]).toEqual({
      uuid: PHOTOS,
      name: "Photos",
      comment: "Holidays",
      mntentref: "00000000-0000-4000-8000-000000000002",
      reldirpath: "Photos/",
    });
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus(),
      LONG,
    );
    expect(screen.getByText("Holidays")).toBeVisible();
    expect(
      (await screen.findAllByText("Description saved.", {}, LONG)).length,
    ).toBeGreaterThan(0);
  });

  it("cancels on Escape without a call", async () => {
    const { user } = await folderPage("sharesSome");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Description" });
    await user.type(field, " more{Escape}");
    expect(
      screen.queryByRole("textbox", { name: "Description" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveFocus();
    expect(screen.getByText("Family photos")).toBeVisible();
    expect(calls("ShareMgmt.set")).toHaveLength(0);
  });

  it("refuses more than 255 characters", async () => {
    const { user } = await folderPage("sharesSome");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Description" });
    await user.clear(field);
    await user.click(field);
    await user.paste("x".repeat(256));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Use at most 255 characters.")).toBeVisible();
    expect(calls("ShareMgmt.set")).toHaveLength(0);
  });
});

describe("unsaved changes (2.8)", () => {
  it("asks before Refresh loses the grid's changes", async () => {
    const { user } = await folderPage("sharesSome");
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(
      within(row("robin")).getByRole("radio", { name: "Read only" }),
    );
    const reads = calls("ShareMgmt.getList").length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("You have changes that are not saved."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Keep my changes" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Keep my changes" }),
    );
    expect(
      within(row("robin")).getByRole("radio", { name: "Read only" }),
    ).toBeChecked();
    expect(calls("ShareMgmt.getList")).toHaveLength(reads);

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Refresh and lose them",
      }),
    );
    await waitFor(
      () =>
        expect(
          within(row("robin")).getByRole("radio", { name: "No access" }),
        ).toBeChecked(),
      LONG,
    );
    await waitFor(() =>
      expect(calls("ShareMgmt.getList").length).toBeGreaterThan(reads),
    );
  });

  it("asks before leaving the page with changes", async () => {
    const { user } = await folderPage("sharesSome");
    await screen.findByRole("button", { name: "Save access" }, LONG);
    await user.click(
      within(row("robin")).getByRole("radio", { name: "Read only" }),
    );
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    await user.click(
      within(crumbs).getByRole("link", { name: "Shared folders" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Leave this page and lose them?"),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Keep my changes" }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Photos" }),
    ).toBeVisible();
  });
});

describe("pointing a folder somewhere else (7)", () => {
  it("repairs a missing folder with mode 770, and the folder is then reachable", async () => {
    const missing = folderUuid(3);
    const { user } = await folderPage("sharesBroken", missing);
    await user.click(
      screen.getByRole("button", { name: "Point it somewhere else…" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: /Point .Missing. somewhere else/,
      }),
    ).toBeVisible();
    const path = await within(dialog).findByRole(
      "textbox",
      { name: "Folder on the file system" },
      LONG,
    );
    expect(path).toHaveValue("Missing");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("ShareMgmt.set")).toHaveLength(1), LONG);
    expect(paramsOf("ShareMgmt.set")[0]).toMatchObject({
      uuid: missing,
      name: "Missing",
      reldirpath: "Missing",
      mode: "770",
    });
    await waitFor(
      () =>
        expect(
          screen.queryByRole("heading", {
            level: 3,
            name: "Its folder is missing",
          }),
        ).not.toBeInTheDocument(),
      LONG,
    );
  });

  it("starts on Cancel, then goes through the fields in reading order, then Save", async () => {
    const { user } = await folderPage("sharesBroken", folderUuid(3));
    await user.click(
      screen.getByRole("button", { name: "Point it somewhere else…" }),
    );
    const dialog = await screen.findByRole("dialog");
    const path = await within(dialog).findByRole(
      "textbox",
      { name: "Folder on the file system" },
      LONG,
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("radiogroup")).toContainElement(
      document.activeElement as HTMLElement,
    );
    await user.tab();
    expect(
      within(dialog).getByRole("checkbox", {
        name: /Share the whole file system/,
      }),
    ).toHaveFocus();
    await user.tab();
    expect(path).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();
  });

  it("refuses a path another shared folder uses", async () => {
    const { user } = await folderPage("sharesBroken", folderUuid(3));
    await user.click(
      screen.getByRole("button", { name: "Point it somewhere else…" }),
    );
    const dialog = await screen.findByRole("dialog");
    const path = await within(dialog).findByRole(
      "textbox",
      { name: "Folder on the file system" },
      LONG,
    );
    await user.clear(path);
    await user.type(path, "notes.txt");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "Notes already uses this folder.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("ShareMgmt.set")).toHaveLength(0);
  });
});
