// SPDX-License-Identifier: GPL-3.0-or-later
// "Linux and Unix computers" on a shared folder's page, on the remembering shares mock with remembering
// NFS answers (phase 5 services design 2; 0.4, 0.5, 0.10, 0.11; P10 to P12): not shared, and letting
// in one computer, a network or any computer with the form's checks and warnings; the duplicate, space
// and no-version refusals; turning NFS on in the same save and retrying only that; the shared view
// with its words, addresses and classic options; changing an entry (also one set in the classic
// interface); stopping with a plain confirmation; the reads failing; and the focus rules of 2.3, 2.5.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nfsEntry, nfsMock, type NfsMockState } from "../../test/nfsAnswers.ts";
import {
  BACKUPS,
  calls,
  folderPage,
  LONG,
  paramsOf,
  PHOTOS,
} from "../../test/sharedFolderPage.ts";

const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const section = () =>
  screen.getByRole("region", { name: "Linux and Unix computers" });

async function nfsPage(start: Partial<NfsMockState> = {}, uuid = PHOTOS) {
  const nfs = nfsMock({
    names: { [PHOTOS]: "Photos", [BACKUPS]: "Backups" },
    ...start,
  });
  const app = await folderPage("sharesSome", uuid, { answers: nfs.answers });
  nfs.attach(app.mock);
  await within(section()).findByText(
    /Not shared with Linux and Unix computers\.|NFS asks for no password\./u,
    {},
    LONG,
  );
  return { ...app, nfs };
}

const shared = () => [
  nfsEntry(1, PHOTOS, "Photos", { client: "192.0.2.10", options: "rw" }),
  nfsEntry(2, PHOTOS, "Photos", { client: "192.0.2.0/24", options: "ro" }),
];

async function openForm(user: Awaited<ReturnType<typeof nfsPage>>["user"]) {
  await user.click(
    within(section()).getByRole("button", { name: "Let a computer in…" }),
  );
  return within(section()).getByRole("form", { name: "Let a computer in" });
}

describe("a folder not shared over NFS (2.1, 2.3)", () => {
  it("opens the form with focus on its heading, One computer chosen, and returns focus on Cancel", async () => {
    const { user } = await nfsPage();
    expect(
      within(section()).getByText("Not shared with Linux and Unix computers."),
    ).toBeVisible();
    const form = await openForm(user);
    expect(
      within(form).getByRole("heading", {
        level: 3,
        name: "Let a computer in",
      }),
    ).toHaveFocus();
    expect(form).toHaveAccessibleDescription(
      /NFS asks for no password\..*Who can use it, above, does not apply to NFS\./su,
    );
    expect(
      within(form).getByRole("radio", { name: "One computer" }),
    ).toBeChecked();
    expect(
      within(form).getByRole("radio", { name: "Read only" }),
    ).toBeChecked();
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(
      within(section()).getByRole("button", { name: "Let a computer in…" }),
    ).toHaveFocus();
  });

  it("checks the address on leaving the field, then lets the computer in and focuses its entry", async () => {
    const { user } = await nfsPage();
    const form = await openForm(user);
    const field = within(form).getByRole("textbox", {
      name: "Its address or name",
    });
    await user.type(field, "192.0.2.300");
    await user.tab();
    expect(
      within(form).getByText(
        "Write one address, such as 192.0.2.10, or one computer name.",
      ),
    ).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    await user.clear(field);
    await user.type(field, "192.0.2.10");
    await user.click(
      within(form).getByRole("radio", { name: "Read and write" }),
    );
    await user.click(within(form).getByRole("button", { name: "Let them in" }));
    await waitFor(() => expect(calls("NFS.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("NFS.setShare")[0]).toEqual({
      uuid: NEW_OBJECT,
      sharedfolderref: PHOTOS,
      mntentref: NEW_OBJECT,
      client: "192.0.2.10",
      options: "rw",
      extraoptions: "subtree_check,insecure",
      comment: "",
    });
    expect(calls("NFS.setSettings")).toHaveLength(0);
    const heading = await within(section()).findByRole(
      "heading",
      { level: 3, name: "The computer at 192.0.2.10" },
      LONG,
    );
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      (
        await screen.findAllByText(
          /Photos.* is set to be shared with .*192\.0\.2\.10.*\. Apply the changes to share it\./u,
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await within(section()).findByText("Not applied yet", {}, LONG),
    ).toBeVisible();
  }, 30_000);

  it("refuses a network that is not its start, /0 and an out-of-range size, and warns about a wide one", async () => {
    const { user } = await nfsPage();
    const form = await openForm(user);
    await user.click(
      within(form).getByRole("radio", { name: "Computers on one network" }),
    );
    const field = within(form).getByRole("textbox", { name: "Network" });
    const tryValue = async (text: string) => {
      await user.clear(field);
      await user.type(field, text);
      await user.tab();
    };
    await tryValue("192.0.2.5/24");
    expect(
      within(form).getByText(
        "192.0.2.5/24 is not the start of a network. Did you mean 192.0.2.0/24?",
      ),
    ).toBeVisible();
    await tryValue("0.0.0.0/0");
    expect(
      within(form).getByText(
        "A network of /0 is every computer. Choose Any computer instead.",
      ),
    ).toBeVisible();
    await tryValue("10.0.0.0/7");
    expect(
      within(form).getByText(
        "Use a size from /8 to /32 for an IPv4 network, or /16 to /128 for IPv6.",
      ),
    ).toBeVisible();
    await tryValue("10.1.0.0/16");
    expect(
      within(form).getByText(
        "This network holds 65,536 addresses. Every computer on it may connect.",
      ),
    ).toBeVisible();
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining("This network holds 65,536 addresses."),
    );
    await tryValue("2001:db8::/32");
    expect(
      within(form).getByText(
        "This network holds a very large number of addresses. Every computer on it may connect.",
      ),
    ).toBeVisible();
    await user.click(within(form).getByRole("button", { name: "Let them in" }));
    await waitFor(() => expect(calls("NFS.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("NFS.setShare")[0]).toMatchObject({
      client: "2001:db8::/32",
      options: "ro",
    });
  }, 30_000);

  it("warns, with the folder's name, when any computer is chosen", async () => {
    const { user } = await nfsPage();
    const form = await openForm(user);
    await user.click(
      within(form).getByRole("radio", {
        name: "Any computer that can reach the NAS",
      }),
    );
    expect(within(form).getByRole("note")).toHaveTextContent(
      "Any computer that can reach this NAS may use Photos. NFS asks for no password, so this includes visitors' computers and anything that gets into your network.",
    );
    // The folder's name sits inside the sentence, isolated, not on a line of its own.
    const name = within(within(form).getByRole("note")).getByText("Photos");
    expect(name.tagName).toBe("BDI");
    expect(name.parentElement?.tagName).toBe("SPAN");
    expect(name.parentElement).toHaveTextContent(
      /^Any computer that can reach this NAS may use Photos\. NFS asks/u,
    );
    await user.click(within(form).getByRole("button", { name: "Let them in" }));
    await waitFor(() => expect(calls("NFS.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("NFS.setShare")[0]).toMatchObject({ client: "*" });
    expect(
      await within(section()).findByRole(
        "heading",
        { level: 3, name: "Any computer that can reach the NAS" },
        LONG,
      ),
    ).toBeVisible();
  });

  it("turns NFS on in the same save, and retries only that when it fails", async () => {
    const { user, nfs } = await nfsPage({
      enable: false,
      setSettingsFails: {
        status: 500,
        message: "Could not write the settings.",
      },
    });
    const form = await openForm(user);
    expect(
      within(form).getByText(
        "Linux and Unix sharing is off for the whole NAS. Saving this turns it on.",
      ),
    ).toBeVisible();
    await user.type(
      within(form).getByRole("textbox", { name: "Its address or name" }),
      "192.0.2.10",
    );
    await user.click(within(form).getByRole("button", { name: "Let them in" }));
    await waitFor(
      () =>
        expect(section()).toHaveTextContent(
          /Photos.*is set up for .*192\.0\.2\.10.*, but Linux and Unix sharing could not be turned on\./u,
        ),
      LONG,
    );
    expect(
      within(section()).getByText("Could not write the settings."),
    ).toBeVisible();
    expect(calls("NFS.setShare")).toHaveLength(1);
    nfs.state.setSettingsFails = undefined;
    await user.click(
      within(section()).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() => expect(calls("NFS.setSettings")).toHaveLength(2), LONG);
    expect(paramsOf("NFS.setSettings")[1]).toEqual({
      enable: true,
      versions: ["3", "4", "4.1", "4.2"],
    });
    expect(calls("NFS.setShare")).toHaveLength(1);
    expect(
      await within(section()).findByRole(
        "heading",
        { level: 3, name: "The computer at 192.0.2.10" },
        LONG,
      ),
    ).toBeVisible();
  }, 30_000);

  it("refuses to save while NFS is off with no version chosen", async () => {
    const { user } = await nfsPage({ enable: false, versions: [] });
    const form = await openForm(user);
    expect(
      within(form).getByText(
        "No NFS version is chosen, so it cannot be turned on. Choose them in the classic interface.",
      ),
    ).toBeVisible();
    const save = within(form).getByRole("button", { name: "Let them in" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    await user.type(
      within(form).getByRole("textbox", { name: "Its address or name" }),
      "192.0.2.10",
    );
    await user.click(save);
    expect(calls("NFS.setShare")).toHaveLength(0);
  });

  it("refuses a folder whose name has a space, without a rename", async () => {
    const { user, mock } = await nfsPage();
    const stored = mock.shares?.config.folders.find((f) => f.uuid === PHOTOS);
    if (stored === undefined) {
      throw new Error("No Photos in the story");
    }
    stored.name = "Holiday Photos";
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const button = await within(section()).findByRole(
      "button",
      { name: "Let a computer in…" },
      LONG,
    );
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-disabled", "true"),
    );
    expect(button).toHaveAccessibleDescription(
      "NFS cannot share a folder whose name or folder on the disk has a space in it. Make a shared folder without spaces for the same files to share them over NFS.",
    );
    await user.click(button);
    expect(within(section()).queryByRole("form")).toBeNull();
  });
});

describe("a folder shared over NFS (2.2)", () => {
  it("says what NFS lets in, each entry with its access, and both addresses on the first", async () => {
    await nfsPage({ shares: shared() });
    const s = section();
    expect(
      within(s).getByText(
        "NFS asks for no password. A computer that is let in says which person is using it, by number, and the NAS believes it. Let in only computers you trust.",
      ),
    ).toBeVisible();
    expect(
      within(s).getByText(
        "Who can use it, above, does not apply to NFS. Over NFS, the file permissions on the disk decide.",
      ),
    ).toBeVisible();
    const items = within(s).getAllByRole("listitem");
    const first = items.find((i) =>
      i.textContent?.startsWith("The computer at 192.0.2.10"),
    );
    expect(first).toHaveTextContent("Read and write");
    expect(first).toHaveTextContent("Address for every computer let in");
    expect(first).toHaveTextContent("nas:/export/Photos");
    expect(first).toHaveTextContent("NFSv4nas:/Photos");
    const second = items.find((i) =>
      i.textContent?.startsWith("Computers on 192.0.2.0/24"),
    );
    expect(second).toHaveTextContent("Read only");
    expect(second).not.toHaveTextContent("nas:/export");
    expect(
      within(s).getByRole("button", { name: "Let another computer in…" }),
    ).toBeVisible();
  });

  it("shows options set in the classic interface, and warns about no_root_squash", async () => {
    await nfsPage({
      shares: [
        nfsEntry(1, PHOTOS, "Photos", {
          extraoptions: "subtree_check,insecure,no_root_squash",
        }),
      ],
    });
    const s = section();
    expect(s).toHaveTextContent(
      "Other NFS optionssubtree_check,insecure,no_root_squash(set in the classic interface)",
    );
    expect(within(s).getByRole("note")).toHaveTextContent(
      "The administrator of the computers let in by this entry acts as this NAS's administrator on the files of Photos: they can read, change and delete every file, whatever its permissions. This was set in the classic interface.",
    );
    const name = within(within(s).getByRole("note")).getByText("Photos");
    expect(name.parentElement?.tagName).toBe("SPAN");
    expect(name.parentElement).toHaveTextContent(
      /^The administrator of the computers/u,
    );
    expect(within(s).queryByRole("radio", { name: /root/u })).toBeNull();
  });

  it("says when NFS is off for the NAS, with its page", async () => {
    await nfsPage({ enable: false, shares: shared() });
    expect(
      within(section()).getByText(
        "Set up for Linux and Unix computers, but Linux and Unix sharing is off.",
      ),
    ).toBeVisible();
    expect(
      within(section()).getByRole("link", {
        name: "Open Linux and Unix sharing",
      }),
    ).toHaveAttribute("href", "/ui/services/nfs");
  });

  it("refuses letting in a computer that may already use the folder", async () => {
    const { user } = await nfsPage({ shares: shared() });
    await user.click(
      within(section()).getByRole("button", {
        name: "Let another computer in…",
      }),
    );
    const form = within(section()).getByRole("form", {
      name: "Let a computer in",
    });
    await user.click(
      within(form).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(form).getByRole("textbox", { name: "Network" }),
      "192.0.2.0/24",
    );
    await user.click(within(form).getByRole("button", { name: "Let them in" }));
    await waitFor(
      () =>
        expect(form).toHaveTextContent(
          /192\.0\.2\.0\/24 may already use .*Photos.*\. Change that entry instead\./u,
        ),
      LONG,
    );
    expect(calls("NFS.setShare")).toHaveLength(0);
  }, 30_000);

  it("changes an entry from the stored object, with only access changed", async () => {
    const { user } = await nfsPage({ shares: shared() });
    const changes = within(section()).getAllByRole("button", {
      name: "Change…",
    });
    await user.click(changes[0]!);
    const form = within(section()).getByRole("form", {
      name: "Change who may connect",
    });
    expect(
      within(form).getByRole("heading", { name: "Change who may connect" }),
    ).toHaveFocus();
    expect(
      within(form).getByRole("radio", { name: "One computer" }),
    ).toBeChecked();
    expect(
      within(form).getByRole("textbox", { name: "Its address or name" }),
    ).toHaveValue("192.0.2.10");
    await user.click(within(form).getByRole("radio", { name: "Read only" }));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("NFS.setShare")).toHaveLength(1), LONG);
    expect(calls("NFS.getShare")).toHaveLength(1);
    const entry = shared()[0]!;
    expect(paramsOf("NFS.setShare")[0]).toEqual({
      uuid: entry.uuid,
      sharedfolderref: PHOTOS,
      mntentref: entry.mntentref,
      client: "192.0.2.10",
      options: "ro",
      extraoptions: "subtree_check,insecure",
      comment: "",
    });
    expect(
      await screen.findByText(
        /The changes for .*192\.0\.2\.10.* are saved\. Apply the changes to use them\./u,
        {},
        LONG,
      ),
    ).toBeVisible();
    const heading = within(section()).getByRole("heading", {
      level: 3,
      name: "The computer at 192.0.2.10",
    });
    await waitFor(() => expect(heading).toHaveFocus());
  }, 30_000);

  it("keeps a value set in the classic interface until one of the three is chosen", async () => {
    const { user } = await nfsPage({
      shares: [
        nfsEntry(1, PHOTOS, "Photos", {
          client: "*.example.org",
          options: "rw,sync",
        }),
      ],
    });
    expect(
      within(section()).getByRole("heading", {
        level: 3,
        name: "*.example.org (set in the classic interface)",
      }),
    ).toBeVisible();
    expect(section()).toHaveTextContent(
      "rw,sync (set in the classic interface)",
    );
    await user.click(
      within(section()).getByRole("button", { name: "Change…" }),
    );
    const form = within(section()).getByRole("form", {
      name: "Change who may connect",
    });
    expect(within(form).queryByRole("radio", { checked: true })).toBeNull();
    expect(form).toHaveTextContent(
      "Now: *.example.org, set in the classic interface. Choose one of these to replace it.",
    );
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(within(form).getByText("Choose who may connect.")).toBeVisible();
    expect(
      within(form).getByText("Choose Read only or Read and write."),
    ).toBeVisible();
    expect(calls("NFS.setShare")).toHaveLength(0);
    await user.click(
      within(form).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(form).getByRole("textbox", { name: "Network" }),
      "198.51.100.0/24",
    );
    await user.click(
      within(form).getByRole("radio", { name: "Read and write" }),
    );
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("NFS.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("NFS.setShare")[0]).toMatchObject({
      client: "198.51.100.0/24",
      options: "rw",
    });
  }, 30_000);

  it("stops letting a computer in after a plain confirmation, and moves focus to the heading", async () => {
    const { user } = await nfsPage({
      shares: [
        nfsEntry(1, PHOTOS, "Photos", {
          extraoptions: "subtree_check,insecure,all_squash",
        }),
      ],
    });
    await user.click(
      within(section()).getByRole("button", { name: "Stop letting them in…" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: /^Stop letting .*192\.0\.2\.10.* use .*Photos.*\?$/u,
    });
    expect(dialog).toHaveTextContent(
      /After the changes are applied, the computer at .*192\.0\.2\.10.* cannot reach Photos over NFS\. The files stay on the NAS\./u,
    );
    expect(dialog).toHaveTextContent(
      "Photos is then not shared over NFS at all.",
    );
    expect(dialog).toHaveTextContent(
      "Its other NFS options, set in the classic interface, are removed with it.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Stop letting them in" }),
    );
    await waitFor(() => expect(calls("NFS.deleteShare")).toHaveLength(1), LONG);
    expect(paramsOf("NFS.deleteShare")[0]).toEqual({
      uuid: nfsEntry(1, PHOTOS, "Photos").uuid,
    });
    expect(
      await screen.findByText(
        /192\.0\.2\.10.* will stop using .*Photos.* when you apply the changes\./u,
        {},
        LONG,
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "Linux and Unix computers",
        }),
      ).toHaveFocus(),
    );
    expect(
      await within(section()).findByText(
        "Not shared with Linux and Unix computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
  }, 30_000);

  it("names any computer in words when stopping it", async () => {
    const { user } = await nfsPage({
      shares: [...shared(), nfsEntry(3, PHOTOS, "Photos", { client: "*" })],
    });
    const stops = within(section()).getAllByRole("button", {
      name: "Stop letting them in…",
    });
    await user.click(stops[2]!);
    const dialog = await screen.findByRole("alertdialog", {
      name: /^Stop letting any computer use .*Photos.*\?$/u,
    });
    expect(dialog).toHaveTextContent(
      "any computer that can reach the NAS cannot reach Photos over NFS.",
    );
    expect(dialog).not.toHaveTextContent("is then not shared over NFS at all");
  });
});

describe("when the NFS reads fail (2.6)", () => {
  it("says so with the server's words and offers no NFS action", async () => {
    const nfs = nfsMock({
      listFails: { status: 500, message: "Share list unreadable." },
    });
    await folderPage("sharesSome", PHOTOS, { answers: nfs.answers });
    expect(
      await within(section()).findByText(
        "Could not read how this folder is shared with Linux and Unix computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(within(section()).getByText("Share list unreadable.")).toBeVisible();
    expect(
      within(section()).queryByRole("button", { name: /Let .*in…/u }),
    ).toBeNull();
    expect(
      within(section()).getByRole("button", { name: "Try again" }),
    ).toBeVisible();
  });
});
