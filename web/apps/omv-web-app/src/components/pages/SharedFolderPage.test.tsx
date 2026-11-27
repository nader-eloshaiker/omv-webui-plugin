// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page through the whole app on the remembering shares mock (phase 5 shares design
// 2, 3, 4, 7, 8; section 19): its states, the summary and what to do now, the reads it makes (none for
// an address that failed its check), and hostile names rendered as inert text.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames } from "../../test/server.ts";
import {
  BACKUPS,
  folderPage,
  folderUuid,
  LONG,
  PHOTOS,
} from "../../test/sharedFolderPage.ts";

describe("a shared folder's page (2)", () => {
  it("shows its name, its file system, where it is and how it is shared", async () => {
    await folderPage("sharesSome");
    expect(
      screen.getByRole("heading", { level: 1, name: "Photos" }),
    ).toBeVisible();
    expect(document.title).toBe("Photos – Shared folders – openmediavault");
    expect(screen.getByText("Family photos")).toBeVisible();
    // Both addresses as text with a copy button, never a link (UI-3).
    expect(
      (await screen.findAllByText("\\\\nas\\Photos", {}, LONG)).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("smb://nas/Photos").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: /nas.Photos/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: "Copy the Windows address of Photos",
      }).length,
    ).toBeGreaterThan(0);
    // Its SMB share's options.
    const smb = screen.getByRole("region", {
      name: "Windows and Mac computers",
    });
    expect(within(smb).getByText("Shown in the network list")).toBeVisible();
    // Guest access and, since the services slice, the recycle bin both read "Off".
    expect(within(smb).getAllByText("Off")).toHaveLength(2);
  });

  it("makes no call for an address that is not a folder's UUID (UI-4)", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesSome",
      path: "/storage/shared-folders/not-a-uuid",
    });
    expect(
      await screen.findByText(
        "This shared folder does not exist. It may have been deleted.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("ShareMgmt.getList");
    expect(callNames()).not.toContain("UserMgmt.getUserList");
    expect(
      screen.getByRole("link", { name: "Go to Shared folders" }),
    ).toBeVisible();
  });

  it("says a UUID that names no folder does not exist", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesSome",
      path: `/storage/shared-folders/${folderUuid(0x99)}`,
    });
    expect(
      await screen.findByText(
        "This shared folder does not exist. It may have been deleted.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("ShareMgmt.setPrivileges");
  });

  it("says when the folder could not be read, with the server's words", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesSome",
      path: `/storage/shared-folders/${PHOTOS}`,
      answers: {
        shareMgmtGetList: { status: 500, message: "Database is locked." },
      },
    });
    expect(
      await screen.findByText("Could not read this shared folder.", {}, LONG),
    ).toBeVisible();
    expect(screen.getByText("Database is locked.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("is loading before the folder is read", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesSome",
      path: `/storage/shared-folders/${PHOTOS}`,
    });
    expect(
      await screen.findByText("Loading the shared folder…", {}, LONG),
    ).toBeInTheDocument();
    await screen.findByRole("heading", { level: 1, name: "Photos" }, LONG);
  });
});

describe("what to do now (2.4)", () => {
  it.each([
    [folderUuid(5), "Its file system is gone", "Point it somewhere else…"],
    [folderUuid(3), "Its folder is missing", "Point it somewhere else…"],
    [folderUuid(4), "It points at a file", "Point it somewhere else…"],
  ])("%s: %s", async (uuid, title, action) => {
    await folderPage("sharesBroken", uuid);
    expect(
      screen.getByRole("heading", { level: 3, name: title }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: action })).toBeVisible();
  });

  it("sends the reader to the file system's page when it is not mounted", async () => {
    await folderPage("sharesBroken", folderUuid(2));
    const todo = screen.getByRole("region", {
      name: "Its file system is not mounted",
    });
    expect(within(todo).getByRole("link", { name: /^Open / })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Point it somewhere else…" }),
    ).not.toBeInTheDocument();
  });

  it("says nothing when the folder is fine", async () => {
    await folderPage("sharesSome");
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("says Windows and Mac sharing is not running, with the service details", async () => {
    await folderPage("sharesSmbDown");
    expect(
      await screen.findByRole(
        "heading",
        { level: 3, name: "Windows and Mac sharing is not running" },
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open the SMB service details" }),
    ).toBeVisible();
  });
});

describe("used by (2.5)", () => {
  it("names a setting this page does not show, with no classic link", async () => {
    await folderPage("sharesUsedElsewhere", BACKUPS);
    const used = await screen.findByRole(
      "heading",
      { level: 2, name: "Used by" },
      LONG,
    );
    expect(used).toBeVisible();
    expect(
      screen.getAllByText(/Used by an add-on's setting/).length,
    ).toBeGreaterThan(0);
  });

  it("is not shown when only its own SMB share uses it", async () => {
    await folderPage("sharesSome");
    await screen.findAllByText("smb://nas/Photos", {}, LONG);
    expect(
      screen.queryByRole("heading", { level: 2, name: "Used by" }),
    ).not.toBeInTheDocument();
  });
});

describe("hostile names (UI-2)", () => {
  it("renders markup-looking names and descriptions as inert text", async () => {
    await folderPage("sharesHostile", folderUuid(1));
    expect(
      screen.getByRole("heading", { level: 1, name: "<b>x</b>" }),
    ).toBeVisible();
    expect(
      screen.getAllByText('<img src=x onerror="alert(1)">')[0],
    ).toBeVisible();
    expect(document.querySelector("main b, main img")).toBeNull();
    await waitFor(
      () =>
        expect(
          screen.getAllByText('<img src=x onerror="alert(1)">').length,
        ).toBeGreaterThan(1),
      LONG,
    );
    expect(document.querySelector("main img")).toBeNull();
  });

  it("keeps a right-to-left name in its own direction", async () => {
    await folderPage("sharesHostile", folderUuid(2));
    const title = screen.getByRole("heading", { level: 1, name: "תמונות" });
    expect(title.querySelector("bdi[dir='auto']")).not.toBeNull();
  });

  it("shows a direction override in a name as a visible mark, so it cannot pass for another name", async () => {
    // The stored name is U+202E then "evil.exe"; shown as is, it would read "exe.live".
    const { user } = await folderPage("sharesHostile", folderUuid(3));
    const shown = "\uFFFDevil.exe";
    expect(
      screen.getByRole("heading", { level: 1, name: shown }),
    ).toBeVisible();
    // The breadcrumb is only the parent page, so the name is not repeated there.
    expect(
      screen.getByRole("navigation", { name: /breadcrumb/i }),
    ).toHaveTextContent(/^Shared folders$/);
    expect(document.title).toBe(`${shown} – Shared folders – openmediavault`);
    // A person's description holding an override, in the access grid.
    expect(await screen.findByText("סם \uFFFDevil", {}, LONG)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/[\u202A-\u202E]/u);

    // The typed confirmation shows the same form, and typing what it shows confirms.
    const files = screen.getByRole("button", {
      name: "Delete with all its files…",
    });
    await waitFor(
      () => expect(files).not.toHaveAttribute("aria-disabled", "true"),
      LONG,
    );
    await user.click(files);
    const dialog = await screen.findByRole("alertdialog");
    const field = await within(dialog).findByRole(
      "textbox",
      { name: `Type ${shown} to confirm.` },
      LONG,
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Delete folder and files",
    });
    await user.type(field, "evil.exe");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.clear(field);
    await user.type(field, shown);
    expect(confirm).not.toHaveAttribute("aria-disabled", "true");
    expect(dialog.textContent).not.toMatch(/[\u202A-\u202E]/u);
  });

  it("shows the override as a visible mark on the list too", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesHostile",
      path: "/storage/shared-folders",
    });
    expect(
      await screen.findByRole(
        "link",
        { name: "Open shared folder \uFFFDevil.exe" },
        LONG,
      ),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/[\u202A-\u202E]/u);
  });
});
