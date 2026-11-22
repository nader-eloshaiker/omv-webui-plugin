// SPDX-License-Identifier: GPL-3.0-or-later
// Deleting a shared folder from its page, both ways, on the remembering shares mock (phase 5 shares
// design 8; 0.8, 0.9; P13, P14; section 19): the blockers in words beside the buttons, the dialog's
// check, the pre-flight while other changes are pending, the plain confirmation that keeps the files,
// the destructive one with the name typed, the step list ending in the apply of exactly what the
// deletion left pending, the result in place of the page, and a cut request checked again.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  calls,
  folderPage,
  folderUuid,
  LONG,
  paramsOf,
} from "../../test/sharedFolderPage.ts";

const RUN = { timeout: 30000 };
const keepButton = () =>
  screen.getByRole("button", { name: "Remove, keep the files…" });
const filesButton = () =>
  screen.getByRole("button", { name: "Delete with all its files…" });

describe("the delete section (8.1)", () => {
  it("is refused while the folder is shared, with Stop sharing in place", async () => {
    const { user } = await folderPage("sharesSome");
    await waitFor(
      () => expect(keepButton()).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(filesButton()).toHaveAttribute("aria-disabled", "true");
    const section = screen.getByRole("region", {
      name: "Delete this shared folder",
    });
    expect(
      within(section).getByText("It is shared with Windows and Mac computers."),
    ).toBeVisible();
    await user.click(keepButton());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.click(
      within(section).getByRole("button", { name: "Stop sharing…" }),
    );
    expect(
      within(await screen.findByRole("alertdialog")).getByText(
        /Stop sharing .Photos. with Windows and Mac computers\?/,
      ),
    ).toBeVisible();
  });

  it("refuses deleting the files of the whole file system, but not removing it", async () => {
    await folderPage("sharesWholeFs", folderUuid(1));
    await waitFor(
      () => expect(filesButton()).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(keepButton()).not.toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        /It is the whole file system .+Deleting all its files would erase everything/,
      ),
    ).toBeVisible();
  });

  it("refuses deleting the files of a folder another one is inside", async () => {
    await folderPage("sharesWholeFs", folderUuid(2));
    await waitFor(
      () => expect(filesButton()).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "SPAN" &&
          el.textContent === "Movies uses Media/Movies, inside this folder.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Delete or move Movies first." }),
    ).toBeVisible();
  });

  it("refuses deleting the files of a folder that cannot be found", async () => {
    await folderPage("sharesBroken", folderUuid(3));
    await waitFor(
      () => expect(filesButton()).toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    expect(
      screen.getByText(
        "Its folder cannot be found, so this page cannot tell what would be deleted.",
      ),
    ).toBeVisible();
    expect(keepButton()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("removing it, keeping the files (8.3, 8.5)", () => {
  it("asks plainly, removes it, applies its change and shows the result in place", async () => {
    const documents = folderUuid(3);
    const { user } = await folderPage("sharesDeleteSlow", documents);
    await waitFor(
      () => expect(keepButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(keepButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByText(
        /Remove the shared folder .Documents.\?/,
        {},
        LONG,
      ),
    ).toBeVisible();
    const confirm = await within(dialog).findByRole(
      "button",
      { name: "Remove shared folder" },
      LONG,
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(within(dialog).getByText(/The files stay on/)).toBeVisible();
    await user.click(confirm);
    await waitFor(() => expect(calls("ShareMgmt.delete")).toHaveLength(1), RUN);
    expect(paramsOf("ShareMgmt.delete")[0]).toEqual({
      uuid: documents,
      recursive: false,
    });
    expect(
      await screen.findByText(/was removed\. Its files are still on/, {}, RUN),
    ).toBeVisible();
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Go to Shared folders" }),
    ).toBeVisible();
  }, 40000);

  it("refuses to start while other changes are pending, offering to apply them first", async () => {
    const documents = folderUuid(3);
    const { user } = await folderPage("sharesDeleteSlow", documents);
    // A saved description leaves "Shared folders" pending.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByRole("textbox", { name: "Description" }),
      "Old{Enter}",
    );
    await waitFor(() => expect(calls("ShareMgmt.set")).toHaveLength(1), LONG);
    await waitFor(
      () => expect(keepButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(keepButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByRole(
        "button",
        { name: "Apply them now" },
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Undo them" }),
    ).toBeVisible();
    expect(calls("ShareMgmt.delete")).toHaveLength(0);
    expect(
      within(dialog).queryByRole("button", { name: "Remove shared folder" }),
    ).not.toBeInTheDocument();
  });
});

describe("deleting it with all its files (8.4, 8.5)", () => {
  it("is red, asks for the exact name, and Enter never confirms", async () => {
    const big = folderUuid(1);
    const { user } = await folderPage("sharesDeleteSlow", big);
    await waitFor(
      () => expect(filesButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(filesButton());
    const dialog = await screen.findByRole("alertdialog");
    const confirm = await within(dialog).findByRole(
      "button",
      { name: "Delete folder and files" },
      LONG,
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(
      within(dialog).getByText(
        /is deleted from the NAS, at once\. This cannot be undone/,
      ),
    ).toBeVisible();
    const field = within(dialog).getByRole("textbox");
    await user.type(field, "big{Enter}");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(calls("ShareMgmt.delete")).toHaveLength(0);
    await user.clear(field);
    await user.type(field, " Big {Enter}");
    expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(calls("ShareMgmt.delete")).toHaveLength(0);
    await user.click(confirm);
    await waitFor(() => expect(calls("ShareMgmt.delete")).toHaveLength(1), RUN);
    expect(paramsOf("ShareMgmt.delete")[0]).toEqual({
      uuid: big,
      recursive: true,
    });
    expect(
      await screen.findByText(/and its files were deleted\./, {}, RUN),
    ).toBeVisible();
  }, 40000);

  it("goes Cancel, the typed field, the confirm button, then the switch, by Tab (8.6)", async () => {
    const { user } = await folderPage("sharesDeleteSlow", folderUuid(1));
    await waitFor(
      () => expect(filesButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(filesButton());
    const dialog = await screen.findByRole("alertdialog");
    const confirm = await within(dialog).findByRole(
      "button",
      { name: "Delete folder and files" },
      LONG,
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const field = within(dialog).getByRole("textbox", {
      name: "Type Big to confirm.",
    });
    const instead = within(dialog).getByRole("button", {
      name: "Remove and keep the files instead",
    });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(field).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.tab();
    expect(instead).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(instead).toHaveFocus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(field).toHaveFocus();
  });

  it("switches to removing it while keeping the files", async () => {
    const { user } = await folderPage("sharesDeleteSlow", folderUuid(1));
    await waitFor(
      () => expect(filesButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(filesButton());
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      await within(dialog).findByRole(
        "button",
        { name: "Remove and keep the files instead" },
        LONG,
      ),
    );
    expect(
      within(dialog).getByRole("button", { name: "Remove shared folder" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cannot tell after a cut request, and checks again", async () => {
    const huge = folderUuid(2);
    const { user } = await folderPage("sharesDeleteSlow", huge);
    await waitFor(
      () => expect(filesButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(filesButton());
    const dialog = await screen.findByRole("alertdialog");
    await user.type(
      await within(dialog).findByRole("textbox", {}, LONG),
      "Huge",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete folder and files" }),
    );
    expect(
      await screen.findByText(
        /Could not tell whether .Huge. was removed\./,
        {},
        RUN,
      ),
    ).toBeVisible();
    expect(calls("Config.applyChangesBg")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Check again" }));
    // The server finished deleting it: the run carries on and saves the change.
    expect(
      await screen.findByText(/and its files were deleted\./, {}, RUN),
    ).toBeVisible();
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
  }, 40000);
});

describe("a blocked deletion's check (8.2)", () => {
  it("re-reads before showing the confirmation", async () => {
    const { user } = await folderPage("sharesDeleteSlow", folderUuid(3));
    await waitFor(
      () => expect(keepButton()).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    const before = calls("SMB.getShareList").length;
    await user.click(keepButton());
    await within(await screen.findByRole("alertdialog")).findByRole(
      "button",
      { name: "Remove shared folder" },
      LONG,
    );
    expect(calls("SMB.getShareList").length).toBeGreaterThan(before);
  });
});
